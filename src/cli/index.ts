import { Command, CommanderError } from "commander";
import { VERSION } from "../config/index.ts";
import { ExitCode } from "../types/index.ts";
import { registerCommands } from "./registry.ts";

const QUICK_START = `
  WAVE — Designer Swiss Knife CLI

  Quick Start:
    wave design-token   Generate design token output, alias=dt
    wave motion         Create motion graphics, alias=mg
    wave compress       Compress image (png, jpg, gif)
    wave doctor         Run health diagnostics

  For more information:
    wave help <command>
`;

const program = new Command();

const DT_SUBCOMMANDS = new Set(["build", "init", "show", "doctor", "wcag"]);
const DT_MODULE_FLAGS = new Set(["--help", "-h"]);
const COMPRESS_SUBCOMMANDS = new Set(["run", "doctor", "install"]);
const COMPRESS_MODULE_FLAGS = new Set(["--help", "-h"]);

function normalizeArgv(argv: string[]): string[] {
  if (argv[2] === "compress") {
    const firstCompressArg = argv[3];
    if (firstCompressArg && COMPRESS_MODULE_FLAGS.has(firstCompressArg)) {
      return argv;
    }
    if (
      !firstCompressArg ||
      firstCompressArg.startsWith("-") ||
      !COMPRESS_SUBCOMMANDS.has(firstCompressArg)
    ) {
      return [...argv.slice(0, 3), "run", ...argv.slice(3)];
    }
    return argv;
  }
  if (argv[2] !== "dt") return argv;
  const firstDtArg = argv[3];
  if (firstDtArg && DT_MODULE_FLAGS.has(firstDtArg)) return argv;
  if (
    !firstDtArg ||
    firstDtArg.startsWith("-") ||
    !DT_SUBCOMMANDS.has(firstDtArg)
  ) {
    return [...argv.slice(0, 3), "build", ...argv.slice(3)];
  }
  return argv;
}

program
  .name("wave")
  .description("WAVE - Design Token CLI")
  .version(VERSION, "--version", "Show version number")
  .helpOption("--help", "Show help")
  .addHelpCommand()
  .exitOverride((err) => {
    if (err instanceof CommanderError) {
      if (err.code === "commander.unknownCommand") {
        process.exitCode = ExitCode.INVALID_COMMAND;
        return;
      } else if (
        err.code === "commander.help" ||
        err.code === "commander.version"
      ) {
        process.exitCode = ExitCode.SUCCESS;
        return;
      }
    }
    process.exitCode = ExitCode.GENERAL_ERROR;
  });

program
  .command("version")
  .description("Show version number")
  .action(() => {
    console.log(VERSION);
  });

registerCommands(program);

// Legacy command migration hints
program
  .command("theme")
  .description('(deprecated) Use "wave create" instead')
  .action(() => {
    console.error('Command "wave theme" has been renamed to "wave create".');
    console.error("  wave create          Generate design token output");
    console.error("  wave create --help   Show available options");
    process.exitCode = ExitCode.INVALID_COMMAND;
  });

program
  .command("list")
  .description('(deprecated) Use "wave show" instead')
  .action(() => {
    console.error('Command "wave list" has been merged into "wave show".');
    console.error("  wave show            Browse built-in resources");
    console.error("  wave show --help     Show available options");
    process.exitCode = ExitCode.INVALID_COMMAND;
  });

program.action(() => {
  console.log(QUICK_START);
});

program.parse(normalizeArgv(process.argv));
