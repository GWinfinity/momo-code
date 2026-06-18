/**
 * MOMO CODE — ANSI Shadow banner + render utilities.
 *
 * The ASCII art is duplicated in `bin/momo` (pure JS entry point).
 * When changing the art, sync BOTH files.
 */

// ---------------------------------------------------------------------------
// ANSI colours
// ---------------------------------------------------------------------------

/** Bright magenta (ANSI 95) — primary brand colour. */
const MAGENTA = "\x1b[95m"
/** Cyan (ANSI 36) — accent / tagline. */
const CYAN = "\x1b[36m"
/** Dim white (ANSI 37) — secondary text. */
const DIM = "\x1b[37m"
/** Reset all attributes. */
const RESET = "\x1b[0m"
/** Bold. */
const BOLD = "\x1b[1m"

// ---------------------------------------------------------------------------
// Banner art (ANSI Shadow style, 6 rows × 75 cols)
// ---------------------------------------------------------------------------

const BANNER_LINES = [
  "███╗   ███╗ ██████╗ ███╗   ███╗ ██████╗    ██████╗ ██████╗ ██████╗ ███████╗",
  "████╗ ████║██╔═══██╗████╗ ████║██╔═══██╗  ██╔════╝██╔═══██╗██╔══██╗██╔════╝",
  "██╔████╔██║██║   ██║██╔████╔██║██║   ██║  ██║     ██║   ██║██║  ██║█████╗  ",
  "██║╚██╔╝██║██║   ██║██║╚██╔╝██║██║   ██║  ██║     ██║   ██║██║  ██║██╔══╝  ",
  "██║ ╚═╝ ██║╚██████╔╝██║ ╚═╝ ██║╚██████╔╝  ╚██████╗╚██████╔╝██████╔╝███████╗",
  "╚═╝     ╚═╝ ╚═════╝ ╚═╝     ╚═╝ ╚═════╝    ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝",
]

/** Raw banner string (no colour — use `renderBanner()` for coloured output). */
export const BANNER = BANNER_LINES.join("\n")

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

/**
 * Render the MOMO CODE banner with brand colours.
 *
 * @param version - Optional version string (printed dim, below tagline)
 * @returns Multi-line string ready for `console.log()`
 */
export function renderBanner(version?: string): string {
  const lines: string[] = []

  // Logo rows — bright magenta
  for (const row of BANNER_LINES) {
    lines.push(`${MAGENTA}${row}${RESET}`)
  }

  // Tagline — cyan
  lines.push(``)
  lines.push(`${CYAN}${BOLD}  The coding agent that evolves${RESET}`)

  // Optional version
  if (version) {
    lines.push(`${DIM}  v${version}${RESET}`)
  }

  return lines.join("\n")
}

/**
 * Convenience: print banner + newline to stdout.
 */
export function printBanner(version?: string): void {
  console.log(renderBanner(version))
  console.log()
}
