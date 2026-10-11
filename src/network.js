import * as Photon from 'photon-realtime';

const APP_ID      = import.meta.env.VITE_PHOTON_APP_ID ?? '';
const APP_VERSION = '1.0';
const REGION      = 'us'; // us | eu | asia | jp …

// Photon custom event codes
export const EV_POSITION = 1; // { x, y, z, r }
export const EV_FIREBALL = 2; // { px, py, pz, dx, dy, dz }
export const EV_HIT      = 3; // { targetId, damage }
export const EV_KILL         = 4; // { killerId, victimId }
export const EV_SCORE_UPDATE = 5; // { actorNr, kills, deaths }
export const EV_RESPAWN      = 6; // {} — sent by victim on respawn
export const EV_PLAYER_NAME  = 7; // { actorNr, name }
export const EV_PLAYER_SKIN  = 8; // { actorNr, skinId }

export class NetworkManager {
  constructor(callbacks) {
    this.callbacks       = callbacks;
    this.client          = null;
    this.localActorNr    = -1;
    this.connected       = false;
    this._joiningRoom    = false;
  }

  connect() {
    // ── Offline fallback when App ID is missing ───────────────────────────
    if (!APP_ID) {
      console.warn('[Network] VITE_PHOTON_APP_ID not set — offline mode.');
      setTimeout(() => {
        this.localActorNr = 1;
        this.connected    = true;
        this.callbacks.onConnected(1);
      }, 300);
      return;
    }

    // ── Real Photon connection ────────────────────────────────────────────
    console.log('[Network] App ID loaded:', APP_ID.slice(0, 8) + '…');
    console.log('[Network] Connecting to region:', REGION);
    Photon.PhotonPeer.setWebSocketImpl(WebSocket);

    const LBC  = Photon.LoadBalancing.LoadBalancingClient;
    const PROT = Photon.ConnectionProtocol;

    this.client = new LBC(PROT.Wss, APP_ID, APP_VERSION);

    // Connection timeout — fall back to offline if Photon doesn't respond
    const timeout = setTimeout(() => {
      if (!this.connected) {
        console.warn('[Network] Connection timed out — falling back to offline mode.');
        this.callbacks.onConnectionFailed('Connection timed out');
      }
    }, 10000);

    // ── State changes ─────────────────────────────────────────────────────
    this.client.onStateChange = (state) => {
      console.log('[Network] State:', state);
      const S = LBC.State;
      const isConnectedToMaster = S ? state === S.ConnectedToMaster : state === 4;
      const isJoinedLobby       = S ? state === S.JoinedLobby       : state === 5;

      if (isConnectedToMaster) {
        this._joinRoom();
      } else if (isJoinedLobby && this._joiningRoom && !this.connected) {
        // createRoom failed (room already exists) — join it instead
        console.log('[Network] Room exists — joining WizardArena…');
        this.client.joinRoom('WizardArena');
      }
    };

    this.client.onConnectedToMaster = () => {
      console.log('[Network] Connected to master — joining room…');
      this._joinRoom();
    };

    // ── Room events ───────────────────────────────────────────────────────
    this.client.onJoinRoom = () => {
      console.log('[Network] Joined room — multiplayer active.');
      clearTimeout(timeout);
      this.localActorNr = this.client.myActor().actorNr;
      this.connected    = true;

      const actors = this.client.myRoomActors();
      Object.keys(actors).forEach(key => {
        const nr = parseInt(key, 10);
        if (nr !== this.localActorNr) this.callbacks.onPlayerJoin(nr);
      });

      this.callbacks.onConnected(this.localActorNr);
    };

    this.client.onActorJoin = (actor) => {
      if (actor.actorNr !== this.localActorNr) {
        this.callbacks.onPlayerJoin(actor.actorNr);
      }
    };

    this.client.onActorLeave = (actor) => {
      this.callbacks.onPlayerLeave(actor.actorNr);
    };

    // ── Custom events ─────────────────────────────────────────────────────
    this.client.onEvent = (code, content, actorNr) => {
      switch (code) {
        case EV_POSITION: this.callbacks.onPosition(actorNr, content); break;
        case EV_FIREBALL: this.callbacks.onFireball(actorNr, content); break;
        case EV_HIT:      this.callbacks.onHit(actorNr, content);      break;
        case EV_KILL:         this.callbacks.onKill(content);        break;
        case EV_SCORE_UPDATE: this.callbacks.onScoreUpdate(content);  break;
        case EV_RESPAWN:      this.callbacks.onRespawn(actorNr);     break;
        case EV_PLAYER_NAME:  this.callbacks.onPlayerName(content);  break;
        case EV_PLAYER_SKIN:  this.callbacks.onPlayerSkin(content);  break;
      }
    };

    this.client.onError = (code, msg) => {
      clearTimeout(timeout);
      console.error('[Photon error]', code, msg);
      this.callbacks.onConnectionFailed(`Photon error ${code}`);
    };

    this.client.connectToRegionMaster(REGION);
  }

  // ── Internal ────────────────────────────────────────────────────────────────
  _joinRoom() {
    if (this._joiningRoom || !this.client) return;
    this._joiningRoom = true;
    let retried = false;

    this.client.onJoinRoomFailed = (code, msg) => {
      console.log('[Network] Room op failed:', code, msg, '— retried:', retried);
      if (!retried) {
        retried = true;
        // createRoom failed (room already exists) — join it instead
        this.client.joinRoom('WizardArena');
      } else {
        this.callbacks.onConnectionFailed(`Room unavailable (${code})`);
      }
    };

    // Always try createRoom first; if room already exists onJoinRoomFailed → joinRoom
    console.log('[Network] Creating/joining room WizardArena…');
    this.client.createRoom('WizardArena', { maxPlayers: 8 });
  }

  // ── Public send helpers ─────────────────────────────────────────────────────
  sendPosition(position, rotation) {
    if (!this.connected || !this.client) return;
    this.client.raiseEvent(EV_POSITION, {
      x: +position.x.toFixed(3),
      y: +position.y.toFixed(3),
      z: +position.z.toFixed(3),
      r: +rotation.toFixed(4),
    });
  }

  sendFireball(position, direction, spell = 'fire') {
    if (!this.connected || !this.client) return;
    this.client.raiseEvent(EV_FIREBALL, {
      px: +position.x.toFixed(3), py: +position.y.toFixed(3), pz: +position.z.toFixed(3),
      dx: +direction.x.toFixed(4), dy: +direction.y.toFixed(4), dz: +direction.z.toFixed(4),
      sp: spell,
    });
  }

  sendHit(targetId, damage, spell = 'fire', dir = null) {
    if (!this.connected || !this.client) return;
    const data = { targetId, damage, sp: spell };
    if (dir) { data.kx = +dir.x.toFixed(3); data.ky = +dir.y.toFixed(3); data.kz = +dir.z.toFixed(3); }
    this.client.raiseEvent(EV_HIT, data);
  }

  sendKill(killerId, victimId) {
    if (!this.connected || !this.client) return;
    this.client.raiseEvent(EV_KILL, { killerId, victimId });
  }

  sendScoreUpdate(actorNr, kills, deaths) {
    if (!this.connected || !this.client) return;
    this.client.raiseEvent(EV_SCORE_UPDATE, { actorNr, kills, deaths });
  }

  sendRespawn() {
    if (!this.connected || !this.client) return;
    this.client.raiseEvent(EV_RESPAWN, {});
  }

  sendPlayerName(actorNr, name) {
    if (!this.connected || !this.client) return;
    this.client.raiseEvent(EV_PLAYER_NAME, { actorNr, name });
  }

  sendPlayerSkin(actorNr, skinId) {
    if (!this.connected || !this.client) return;
    this.client.raiseEvent(EV_PLAYER_SKIN, { actorNr, skinId });
  }

  /** Number of players currently in the room. */
  getPlayerCount() {
    if (!this.connected) return 1;
    if (!this.client) return 1;
    try {
      const actors = this.client.myRoomActors();
      return actors ? Object.keys(actors).length : 1;
    } catch { return 1; }
  }
}
