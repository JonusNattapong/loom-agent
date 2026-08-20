import chalk from "chalk";
import type { SelectListTheme } from "../components/select-list.js";
import type { EditorTheme } from "../components/editor.js";

export const defaultSelectListTheme: SelectListTheme = {
  selectedPrefix: (text: string) => chalk.cyan("› ") + text,
  selectedText: (text: string) => chalk.bold.cyan(text),
  description: (text: string) => chalk.dim(text),
  argumentHint: (text: string) => chalk.yellow(text),
  sourceTag: (text: string) => chalk.dim.magenta(text),
  scrollInfo: (text: string) => chalk.dim(text),
  noMatch: (text: string) => chalk.red(text),
};

export const defaultEditorTheme: EditorTheme = {
  borderColor: (str: string) => chalk.dim(str),
  commandColor: (str: string) => chalk.cyan(str),
  selectList: defaultSelectListTheme,
};

export const defaultMarkdownTheme = {
  heading: (text: string) => chalk.bold.cyan(text),
  link: (text: string) => chalk.blue.underline(text),
  linkUrl: (text: string) => chalk.dim(text),
  code: (text: string) => chalk.yellow(text),
  codeBlock: (text: string) => chalk.gray(text),
  codeBlockBorder: (text: string) => chalk.dim(text),
  quote: (text: string) => chalk.italic.gray(text),
  quoteBorder: (text: string) => chalk.dim(text),
  hr: (text: string) => chalk.dim(text),
  listBullet: (text: string) => chalk.cyan(text),
  bold: (text: string) => chalk.bold(text),
  italic: (text: string) => chalk.italic(text),
  strikethrough: (text: string) => chalk.strikethrough(text),
  underline: (text: string) => chalk.underline(text),
};

