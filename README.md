# DeepSeek Harness

English | [中文](README.zh.md)

DeepSeek Harness (`dsh`) is an open-source agent harness developed by [DeepSeek AI](https://deepseek.com).

It is built on an **everything-is-a-plugin** architecture and powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512).

Documentation: [https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)

## Developer preview

DeepSeek Harness is in _developer preview_ and iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**

Review the [safety notice](SAFETY.md) before running the project.

## Run

### Run from `npm`

Install `Node.js`, then run:

```sh
npx @deepseek-ai/dsh web
```

The command starts the Web UI at `http://127.0.0.1:3080` by default and opens it in the default browser for a local launch. An SSH launch only prints the host URL because the SSH client or editor owns the local forwarded address. Pass `--no-open` to run the server without opening a browser. See [Web UI guide](docs/user/guide/index.md).

### Run from source

To run from a repository checkout:

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` prepares the repository artifacts. `pnpm dsh web` uses those built artifacts without rebuilding.

## Community and support

- Submit feedback or bug reports through [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions).
- Add the [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic to your plugin repository for discoverability.
- Join <a href="https://discord.gg/4MrtZUhpxg">DeepSeek Harness Discord community</a>.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

Start with the [development guide](docs/development.md) and [architecture documentation](docs/architecture.md).

`pnpm run dev:web` builds, serves, and rebuilds client bundles on source edits in one terminal, and `make help` lists the matching Make targets for Web and Desktop; the guide's application commands section owns the full table.

### Building the Desktop app locally (macOS arm64)

```sh
pnpm install
ELECTRON_MIRROR=https://cdn.npmmirror.com/binaries/electron/ \
  pnpm run package:desktop:mac:arm64:unsigned
```

Artifacts land in `apps/desktop/.desktop-build/targets/mac-arm64/unsigned-artifacts/`: a runnable `mac-arm64/DeepSeek Harness.app` and `deepseek-harness-<version>-mac-arm64-unsigned.dmg`. They are local unsigned (ad-hoc) builds; drag the app to Applications or copy it with `ditto`.

Mirrors and proxies: Electron downloads from GitHub by default; on a slow link set `ELECTRON_MIRROR=https://cdn.npmmirror.com/binaries/electron/` (or `electron_mirror=...` in `~/.npmrc`). The zip is cached under `apps/desktop/.desktop-build/downloads/`, so one version downloads once. npm uses the `registry=https://registry.npmmirror.com/` line in `~/.npmrc`. When GitHub is unreachable, export `https_proxy=http://127.0.0.1:1080 http_proxy=http://127.0.0.1:1080 all_proxy=socks5://127.0.0.1:1080`; `@electron/get` reads those variables only with `ELECTRON_GET_USE_PROXY=true`.

The repository pins the Electron version (currently 44.7.0); newer is not automatically better. An upgrade also changes Chromium and Node, so it requires reinstalling dependencies, repackaging, and regressing the native modules (pty, sandbox, image, addon) plus mirror availability before it lands.

For agents, follow [AGENTS.md](AGENTS.md).

## Citation

```bibtex
@misc{deepseek-harness2026,
  title={DeepSeek Harness: Everything is a Plugin},
  author={DeepSeek-AI},
  year={2026},
  publisher={GitHub},
  howpublished={\url{https://github.com/deepseek-ai/deepseek-harness}},
}
```

## License

[MIT](LICENSE)

Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
