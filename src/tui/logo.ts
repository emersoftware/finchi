// ANSI art logo — uses terminal's default yellow/orange (ANSI color 33)
const O = "\x1b[33m";
const R = "\x1b[0m";

export const LOGO_LINES = [
  `  ${O}\u2584${R}${O}\u2584${R}   ${O}\u2584${R}                ${O}\u2584${R}${O}\u2584${R}       ${O}\u2584${R} `,
  ` ${O}\u2588${R}  ${O}\u2580${R} ${O}\u2584${R}${O}\u2584${R}  ${O}\u2584${R}${O}\u2584${R} ${O}\u2584${R}${O}\u2584${R}    ${O}\u2584${R}${O}\u2584${R}${O}\u2584${R}${O}\u2584${R}  ${O}\u2588${R} ${O}\u2584${R}${O}\u2584${R}   ${O}\u2584${R}${O}\u2584${R} `,
  `${O}\u2580${R}${O}\u2588${R}${O}\u2580${R}${O}\u2580${R}   ${O}\u2588${R}   ${O}\u2588${R}${O}\u2580${R}  ${O}\u2588${R}  ${O}\u2588${R}   ${O}\u2580${R}  ${O}\u2588${R}${O}\u2580${R}  ${O}\u2588${R}   ${O}\u2588${R} `,
  ` ${O}\u2588${R}     ${O}\u2588${R}   ${O}\u2588${R}   ${O}\u2588${R}  ${O}\u2588${R}   ${O}\u2584${R}  ${O}\u2588${R}   ${O}\u2588${R}   ${O}\u2588${R} `,
  `${O}\u2580${R}${O}\u2580${R}${O}\u2580${R}${O}\u2580${R}  ${O}\u2580${R}${O}\u2580${R}${O}\u2580${R} ${O}\u2580${R}${O}\u2580${R}${O}\u2580${R} ${O}\u2580${R}${O}\u2580${R}${O}\u2580${R}  ${O}\u2580${R}${O}\u2580${R}${O}\u2580${R}  ${O}\u2580${R}${O}\u2580${R}${O}\u2580${R} ${O}\u2580${R}${O}\u2580${R}${O}\u2580${R} ${O}\u2580${R}${O}\u2580${R}${O}\u2580${R}`,
];

export function printLogo(): void {
  console.log();
  for (const line of LOGO_LINES) {
    console.log(line);
  }
  console.log();
}
