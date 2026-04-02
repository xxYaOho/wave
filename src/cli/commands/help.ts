import { Command } from 'commander';

export const helpCommand = new Command('help')
  .description('Show usage instructions')
  .argument('[command]', 'Command name to show help for')
  .action((command?: string) => {
    if (command) {
      showCommandHelp(command);
    } else {
      showFullHelp();
    }
  });

function showFullHelp(): void {
  console.log(`
🌊 WAVE - Design Token CLI

Usage:
  wave [command] [options]

Commands:
  theme     Generate theme tokens
  doctor    Check tool health status
  help      Show usage instructions

Options:
  --version    Show version number
  --help       Show help

Examples:
  wave theme                     Generate theme from current directory
  wave theme -f ./themefile      Specify themefile path
  wave theme --no-night          Skip night mode
  wave theme --no-variants       Skip variants generation
  wave doctor                    Run diagnostics

For more information about a command:
  wave help <command>
`);
}

function showCommandHelp(command: string): void {
  const helps: Record<string, string> = {
    theme: `
wave theme - Generate theme tokens

Usage:
  wave theme [options]

Options:
  -f, --file <path>      Themefile path
  --list                 List built-in themes
  --no-night             Disable night mode generation
  --no-variants          Disable variants generation
  --variants [names]     Specify variants (comma separated)
  --init                 Create theme template
  -o, --output <dir>     Output directory

Themefile example:
  THEME my-theme
  RESOURCE palette leonardo
  RESOURCE dimension wave
  RESOURCE custom ./brand.yml

  PARAMETER platform css
  PARAMETER colorSpace oklch

Examples:
  wave theme
  wave theme -f ./custom/themefile
  wave theme --no-night
  wave theme --no-variants
  wave theme --variants "dark, matrix"
`,
    doctor: `
wave doctor - Check tool health status

Usage:
  wave doctor

Checks:
  - Bun version
  - Built-in resources
  - Configuration files
  - Output directory permissions

Examples:
  wave doctor
`,
    help: `
wave help - Show usage instructions

Usage:
  wave help [command]

Arguments:
  command      Command name to show help for

Examples:
  wave help
  wave help theme
  wave help doctor
`,
  };

  const help = helps[command];
  if (help) {
    console.log(help);
  } else {
    console.log(`Unknown command: ${command}`);
    console.log('Available commands: theme, doctor, help');
  }
}
