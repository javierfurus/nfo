# Changelog

## [0.0.8](https://github.com/javierfurus/nfo/compare/nfo-cli-v0.0.7...nfo-cli-v0.0.8) (2026-07-29)


### Features

* add markdown support ([#16](https://github.com/javierfurus/nfo/issues/16)) ([4b77577](https://github.com/javierfurus/nfo/commit/4b77577a2476114a6208700455295317a68ca891))
* improve tracking ([#18](https://github.com/javierfurus/nfo/issues/18)) ([8240e17](https://github.com/javierfurus/nfo/commit/8240e174f31565a72228283d2a52ed49274a7412))
* **mcp:** add report_state tool for self-reported progress ([554e781](https://github.com/javierfurus/nfo/commit/554e7814def13ad6941ab168cc86856596b6494e))
* **mcp:** report_done now sets waiting instead of idle ([76984eb](https://github.com/javierfurus/nfo/commit/76984eb40eac0adc4cf8236665a342f955cc3c21))
* **spawn:** run nvm use before npm ci in fresh worktrees ([2db0146](https://github.com/javierfurus/nfo/commit/2db01460e615234e93ffb7e235b57c97a19fc8a1))
* **state:** add setMusicianState updater with detail truncation ([8e42796](https://github.com/javierfurus/nfo/commit/8e42796f88e578f0e28e8b57e33a6fc113d865d9))
* **state:** add waiting status + detail fields, recolor idle ([4048cb3](https://github.com/javierfurus/nfo/commit/4048cb3516eb3e7b28c9195029692a09a4a5588d))
* **tui:** bootstrap-idle + ongoing-waiting liveness backstop ([0751491](https://github.com/javierfurus/nfo/commit/07514915080fb81468d129e9b0ce81f7b305808b))
* **tui:** collapsible right sidebar with Ctrl+B auto-hide + narrow-screen force-hide ([55b5367](https://github.com/javierfurus/nfo/commit/55b53674e4f3d0b837c06db3aad2739b09a5897a))
* **tui:** show model + runtime + self-reported detail in Auditorium ([c4b2a6f](https://github.com/javierfurus/nfo/commit/c4b2a6f7b240ff4b082ef58e45de0fde28c9542b))
* update readme ([2b10708](https://github.com/javierfurus/nfo/commit/2b10708e06f314ff39cc3bcf80ccfb6153521375))


### Bug Fixes

* **message:** add sqlite ([de70c29](https://github.com/javierfurus/nfo/commit/de70c2916301c86f2faae59b4407d302d7bca316))
* **message:** deliver queued messages to waiting (post-report_done) musicians ([e67899d](https://github.com/javierfurus/nfo/commit/e67899d59f31b3adecc26028df027a7826e849fe))
* **tmux:** deliver large reports/messages via paste-buffer to avoid argv limit ([3924fc5](https://github.com/javierfurus/nfo/commit/3924fc561d89750e99f347e0a0bf15febbae6937))
* **tmux:** launching multiple nfo sessions for the same project would kill tmux ([0375b6c](https://github.com/javierfurus/nfo/commit/0375b6c40b4dc9a20d11d58898acc62f752fc411))

## [0.0.7](https://github.com/javierfurus/nfo/compare/nfo-cli-v0.0.6...nfo-cli-v0.0.7) (2026-06-29)


### Features

* add lazygit and CLAUDE_CONFIG_PATH ([0d3766c](https://github.com/javierfurus/nfo/commit/0d3766cf9bfa2272f3c6ee1d96f17b1ab03462c1))
* first two phases of performance improvement ([9f4e55c](https://github.com/javierfurus/nfo/commit/9f4e55c51c1d05aab78255d2cfbae4bed1972f81))
* **lazygit:** resize lazygit ([df53a1e](https://github.com/javierfurus/nfo/commit/df53a1e5fa8925f41b67c82ddf9ec371be34d7de))
* **lazygit:** update README with LazyGit ([e573640](https://github.com/javierfurus/nfo/commit/e5736406dd64036565a943bfdc2bf04c08963619))
* **tui:** allow copy mode in Agent pane ([2490090](https://github.com/javierfurus/nfo/commit/249009090706b0029a88eaa5ea44ccad18e1f74d))

## [0.0.6](https://github.com/javierfurus/nfo/compare/nfo-cli-v0.0.5...nfo-cli-v0.0.6) (2026-06-09)


### Features

* **notes:** replace editor ([#11](https://github.com/javierfurus/nfo/issues/11)) ([28bacb9](https://github.com/javierfurus/nfo/commit/28bacb9ac0e989322930fd2dbae46260a5ca93f3))


### Bug Fixes

* unwrap from tmux ([bcbc6e3](https://github.com/javierfurus/nfo/commit/bcbc6e393c5a01a5892d2d87131da4b082c71019)), closes [#1](https://github.com/javierfurus/nfo/issues/1)

## [0.0.5](https://github.com/javierfurus/nfo/compare/nfo-cli-v0.0.4...nfo-cli-v0.0.5) (2026-06-06)


### Features

* always dimsiss worktrees by default ([719b0e8](https://github.com/javierfurus/nfo/commit/719b0e8f5f4c6bf8d32f79c1bf0258a2ee47cdbb))
* clean up phase comment, refine role ([27e4c15](https://github.com/javierfurus/nfo/commit/27e4c15a7e83f3b36d7a6d0cea8723e24605b7d2))
* create roles for specific tasks ([c93eeb4](https://github.com/javierfurus/nfo/commit/c93eeb45ef6a237dcf98e73b896fb2ff3c7f2cd4))
* ensure that orchestrator deploys musicians ([8b44a98](https://github.com/javierfurus/nfo/commit/8b44a986c7a0b03d686cfc5197f11b5f50654057))
* harden exploration and coding prompts ([2e6165a](https://github.com/javierfurus/nfo/commit/2e6165ac15c752ec1c0ecfb024b53cb42d16321a))
* initial release ([ea9eacc](https://github.com/javierfurus/nfo/commit/ea9eacc52e1729cdd3159bcea4ff1f309801e64a))
* instruct Musicians to always npm ci ([eb49c68](https://github.com/javierfurus/nfo/commit/eb49c68c1021d5100a303f98be3c48243a45c28c))
* limit tool use for explorer agents ([0fb74bc](https://github.com/javierfurus/nfo/commit/0fb74bc2874f43c9d933288c9b12903cc5ad9891))
* render help as centered overlay instead of full-screen replace ([d402574](https://github.com/javierfurus/nfo/commit/d402574b0d5f2df90bea6fa3ac3af23717e6be9a))
* update README.md with some flavour ([b423323](https://github.com/javierfurus/nfo/commit/b423323ce2fb38003da827566b888b4a33c02f96))


### Bug Fixes

* spawning bugs ([a401f19](https://github.com/javierfurus/nfo/commit/a401f199f6a2e369af421cff3692375fb4db2b8f))

## [0.0.4](https://github.com/javierfurus/nfo/compare/nfo-cli-v0.0.3...nfo-cli-v0.0.4) (2026-06-06)


### Features

* always dimsiss worktrees by default ([719b0e8](https://github.com/javierfurus/nfo/commit/719b0e8f5f4c6bf8d32f79c1bf0258a2ee47cdbb))
* clean up phase comment, refine role ([27e4c15](https://github.com/javierfurus/nfo/commit/27e4c15a7e83f3b36d7a6d0cea8723e24605b7d2))
* create roles for specific tasks ([c93eeb4](https://github.com/javierfurus/nfo/commit/c93eeb45ef6a237dcf98e73b896fb2ff3c7f2cd4))
* ensure that orchestrator deploys musicians ([8b44a98](https://github.com/javierfurus/nfo/commit/8b44a986c7a0b03d686cfc5197f11b5f50654057))
* harden exploration and coding prompts ([2e6165a](https://github.com/javierfurus/nfo/commit/2e6165ac15c752ec1c0ecfb024b53cb42d16321a))
* initial release ([ea9eacc](https://github.com/javierfurus/nfo/commit/ea9eacc52e1729cdd3159bcea4ff1f309801e64a))
* instruct Musicians to always npm ci ([eb49c68](https://github.com/javierfurus/nfo/commit/eb49c68c1021d5100a303f98be3c48243a45c28c))
* limit tool use for explorer agents ([0fb74bc](https://github.com/javierfurus/nfo/commit/0fb74bc2874f43c9d933288c9b12903cc5ad9891))
* render help as centered overlay instead of full-screen replace ([d402574](https://github.com/javierfurus/nfo/commit/d402574b0d5f2df90bea6fa3ac3af23717e6be9a))
* update README.md with some flavour ([b423323](https://github.com/javierfurus/nfo/commit/b423323ce2fb38003da827566b888b4a33c02f96))


### Bug Fixes

* spawning bugs ([a401f19](https://github.com/javierfurus/nfo/commit/a401f199f6a2e369af421cff3692375fb4db2b8f))
