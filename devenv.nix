{ pkgs, ... }: {
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

  # Enable formatters via git-hooks
  # git-hooks.hooks = {
  #   nixfmt.enable = true;
  #   prettier.enable = true;
  # };
}
