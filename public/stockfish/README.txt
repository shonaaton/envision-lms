Drop a Stockfish.js WASM build here.

Recommended: https://github.com/lichess-org/stockfish.js
Files needed:
  - stockfish.js     (the worker entrypoint)
  - stockfish.wasm   (the engine binary)

The AnalysisBoard and PlayVsComputer components instantiate
`new Worker("/stockfish/stockfish.js")` — if these files are missing
the boards still work, just without engine evaluation / opponent.
