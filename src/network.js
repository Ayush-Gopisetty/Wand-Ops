import * as Photon from 'photon-realtime';

const APP_ID      = import.meta.env.VITE_PHOTON_APP_ID ?? '';
const APP_VERSION = '1.0';
const REGION      = 'us'; // us | eu | asia | jp …

// Photon custom event codes
export const EV_POSITION = 1; // { x, y, z, r }
export const EV_FIREBALL = 2; // { px, py, pz, dx, dy, dz }
export const EV_HIT      = 3; // { targetId, damage }

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
    const LBC  = Photon.LoadBalancing.LoadBalancingClient;
    const PROT = Photon.ConnectionProtocol;

    this.client = new LBC(PROT.Wss, APP_ID, APP_VERSION);

    // ── State changes ─────────────────────────────────────────────────────
    this.client.onStateChange = (state) => {
      const S = LBC.State;
      if (S && state === S.ConnectedToMaster) this._joinRoom();
      else if (!S && state === 3) this._joinRoom();
    };

    this.client.onConnectedToMaster = () => this._joinRoom();

    // ── Room events ───────────────────────────────────────────────────────
    this.client.onJoinRoom = () => {
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
      }
    };

    this.client.onError = (code, msg) => {
      console.error('[Photon error]', code, msg);
    };

    this.client.connectToRegionMaster(REGION);
  }

  // ── Internal ────────────────────────────────────────────────────────────────
  _joinRoom() {
    if (this._joiningRoom || !this.client) return;
    this._joiningRoom = true;

    // All players share the same room — joinOrCreateRoom handles both paths
    this.client.joinOrCreateRoom('WizardArena', {
      maxPlayers: 8,
      isOpen: true,
      isVisible: true,
    });
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

  sendHit(targetId, damage, spell = 'fire') {
    if (!this.connected || !this.client) return;
    this.client.raiseEvent(EV_HIT, { targetId, damage, sp: spell });
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
