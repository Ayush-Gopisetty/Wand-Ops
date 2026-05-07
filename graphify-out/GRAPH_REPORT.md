# Graph Report - Wizard-FPS  (2026-05-06)

## Corpus Check
- 8 files · ~6,466 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 64 nodes · 75 edges · 7 communities (3 shown, 4 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9381b4a5`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]

## God Nodes (most connected - your core abstractions)
1. `UIManager` - 13 edges
2. `NetworkManager` - 12 edges
3. `Controls` - 9 edges
4. `Player` - 9 edges
5. `FireballManager` - 7 edges
6. `update()` - 5 edges
7. `loop()` - 4 edges
8. `init()` - 3 edges
9. `createScene()` - 3 edges
10. `getGroundY()` - 2 edges

## Surprising Connections (you probably didn't know these)
- `init()` --calls--> `createScene()`  [INFERRED]
  src/main.js → src/scene.js

## Communities (7 total, 4 thin omitted)

### Community 2 - "Community 2"
Cohesion: 0.21
Nodes (4): clamp(), darken(), Player, remoteColor()

### Community 3 - "Community 3"
Cohesion: 0.36
Nodes (8): castFireball(), clamp(), getGroundY(), init(), loop(), update(), updateCamera(), createScene()

## Knowledge Gaps
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `UIManager` connect `Community 0` to `Community 3`?**
  _High betweenness centrality (0.341) - this node is a cross-community bridge._
- **Why does `NetworkManager` connect `Community 1` to `Community 3`?**
  _High betweenness centrality (0.315) - this node is a cross-community bridge._
- **Why does `Player` connect `Community 2` to `Community 3`?**
  _High betweenness centrality (0.253) - this node is a cross-community bridge._