{ pkgs, ... }: {
  languages = {
    # devenv.sh/languages/javascript/
    javascript = {
      enable = true;
      package = pkgs.nodejs_22;
    };

    # devenv.sh/languages/typescript/
    typescript.enable = true;
  };

  claude.code.enable = true;

  # Enable formatters via git-hooks
  git-hooks.hooks = {
    rustfmt.enable = true;
    nixfmt.enable = true;
    black.enable = true;
    prettier.enable = true;
  };

  devcontainer.enable = true;
}
