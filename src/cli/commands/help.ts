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
  wave theme beluga              Generate beluga theme
  wave theme --list              List built-in themes
  wave theme beluga --no-night   Skip night mode
  wave theme beluga --no-variants   Skip variants generation
  wave theme beluga --variants "dark, matrix"
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
  wave theme [name] [options]

Arguments:
  name         Theme name to generate (required unless --list or --init)

Options:
  -f, --file <path>      Themefile path
  --list                 List built-in themes
  --no-night             Disable night mode generation
  --no-variants          Disable variants generation
  --variants [names]     Specify variants (comma separated)
  --init                 Create theme template

Examples:
  wave theme beluga
  wave theme --list
  wave theme beluga --no-night
  wave theme beluga --no-variants
  wave theme beluga --variants "dark, matrix"
  wave theme --file ./custom/themefile
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
