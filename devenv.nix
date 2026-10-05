{ pkgs, ... }:
{
  packages = [ pkgs.git-lfs ];

  languages = {
    # devenv.sh/languages/javascript/
    javascript = {
      enable = true;
      package = pkgs.nodejs_22;

      pnpm.enable = true;
    };

    # devenv.sh/languages/typescript/
    typescript.enable = true;
  };

  # Screenshots under docs/ are stored with Git LFS (docs/design/README.md).
  enterShell = ''
    git rev-parse --git-dir >/dev/null 2>&1 && git lfs install --local >/dev/null
  '';

  # Formatters run on staged files at commit time. Prettier uses the repo's
  # pinned version so the hook agrees with `pnpm check`.
  git-hooks.hooks = {
    nixfmt.enable = true;
    prettier = {
      enable = true;
      settings.binPath = "./node_modules/.bin/prettier";
    };
  };
}
