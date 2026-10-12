# vr-cards

A card table in mixed reality, for the Meta Quest browser and any WebXR headset, on Three.js. It does the parts
every card game needs: the table set on a real surface, the player's hand, cards that can be pinched or pointed at,
the status board, sign-in and live updates from the game's server. The game itself supplies its rules, its layout
of the felt and its API calls.

TypeScript source, no build step: the app compiles it with its own Vite and `tsc`.

## Modules

| Module | What |
|---|---|
| `api` | `ApiClient`: bearer token kept in the browser, the error envelope (`ApiError`), sign-ins (Google, pairing code, dev login), `me`, leaderboard, hall of fame. The game adds its own calls with `call` |
| `signin` | the flat page's sign-in section (`#google`, `#pair`, `#pairing`, `#pair-url`, `#pair-code`, `#pair-cancel`, `#dev-signin`, `#dev-identities`); `codeExpired` for its one message in another language |
| `google` | Google Identity Services button, giving an ID token |
| `realtime` | a Mercure stream, read with fetch and a bearer, reconnecting |
| `stage` | the table in the room: renderer, XR session, passthrough, controllers and hands, pinch, rays, mouse drag, status board, standings panel, "Move table". The game puts its cards on `stage.table` and gets `activate` and `release` calls (`StageDelegate`). Its own words are English unless the game passes `texts` |
| `placement` | the table set on a real surface, anchored, found again next session |
| `fan` | `HandFan` (the player's hand: layout, "is this point over it", "where along it") and `heldFan` (the other players') |
| `layout` | the table being rearranged before it is sent, and the player's order of the hand; `fixed` keeps what was on the table there |
| `sorting` | sort by runs or sets with second copies apart (`cardOrder`), linking neighbours that could be a meld (`linked`), for any rank order and meld rules |
| `cards`, `label`, `scene`, `sounds`, `backs`, `handOrder` | card meshes, text in the scene, felt and controls, WebAudio sounds, opponents' backs, the kept hand order |

## What it expects

* **Cards**: codes of rank, suit, back: `Khr` king of hearts with a red back, `Tcb` ten of clubs blue back, `wbr`
  black joker red back. Two decks, two backs, so every code is unique. Faces are served by the app as
  `cards/<rank><suit>.svg` (`KH.svg`, `TC.svg`), jokers `1J.svg` (red) and `2J.svg` (black), backs `2B.svg` (red)
  and `1B.svg` (blue). [RevK's SVG playing cards][1] (CC0) fit.
* **API**, under the base given to `ApiClient`, JSON in and out:
  * errors: `{ "error": { "code", "message" }, "game"? }`, the current game view on a conflict
  * `POST /auth/google` `{ idToken, device? }` and `POST /auth/pair/token` `{ pairing }` answer
    `{ token, player }`; the latter `{ status: "pending" }` until confirmed
  * `POST /auth/pair` `{ device }`: `{ code, pairing, verify, expires, interval }`
  * `DELETE /auth/token`, `GET /me`, `GET /leaderboard`, `GET /hall-of-fame`
  * development only, same origin: `GET /_dev/login` (JSON `{ identities }`), `GET /_dev/login/{identifier}`,
    `POST /_dev/api-token`
* **Realtime**: a Mercure hub taking `Authorization: Bearer`, messages `{ game, status, revision }`.

## Using it

```bash
npm install @garak_/vr-cards three
```

```ts
import { Stage } from "@garak_/vr-cards/stage";
```

Working on this package and a game together, link it instead (`"@garak_/vr-cards": "file:../vr_cards"`). The link
brings this folder's own Three.js (for its tests) along, so keep a single one:

* `vite.config.ts`: `resolve: { dedupe: ["three"] }`, and `server.fs.allow: [".", "../vr_cards"]`
* `tsconfig.json`: `paths` for `three` and `three/addons/*` to the app's own `node_modules/@types/three`

With Node in a container, mount this folder where the link expects it: `-v $(CURDIR)/../vr_cards:/vr_cards`.

## Developing

* `make install`, `make test`, `make check` (Node in a container)

## License

[LGPL-3.0-or-later](LICENSE): the GNU Lesser General Public License, version 3 or any later version, which builds
on the GNU General Public License ([COPYING](COPYING)). A game may use this package without being under the same
license; changes to the package itself are shared under it.

[1]: https://www.me.uk/cards/
