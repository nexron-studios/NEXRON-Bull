//! Reads the screen of the hidden Claude Code that Bull dictates through (see `dictation.rs`):
//! its prompt box, what the voice footer says, and the folder-trust dialog. Everything here is
//! how Claude Code 2.1.332 draws its TUI, found by driving it in a PTY; a redesign of that TUI
//! breaks this file first.
//!
//! The prompt box is the last pair of rows drawn only with `─`, the input between them starts
//! with `❯`. Claude draws its placeholder ("Try …") and a transcript that is not final yet in
//! SGR 2 (dim), typed and finished text plainly, so only the plain cells count as text.

const RULE: char = '─';
const PROMPT_MARK: char = '❯';
/// Prompt mark and the space after it, also on every following input row.
const INPUT_INDENT: u16 = 2;
const TRUST_YES: &str = "Yes, I trust this folder";
/// Footer words of hold-to-talk. Claude Code's interface is English only.
const WARMUP_MARK: &str = "keep holding";
const LISTENING_MARK: &str = "listening…";
const TRANSCRIBING_MARK: &str = "Transcribing…";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VoicePhase {
    /// No recording: the prompt shows what was typed or dictated.
    Idle,
    /// Claude saw the first repeated spaces and waits for more before it records.
    Warmup,
    Listening,
    /// The key was let go; the transcript is on its way.
    Transcribing,
}

/// Which answer the trust dialog has selected.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrustChoice {
    Yes,
    No,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Prompt {
    /// The input's plain text: neither the placeholder nor a transcript still being recognised
    pub text: String,
    pub phase: VoicePhase,
    /// The row above the box, where Claude puts notices like "No speech detected"
    pub notice: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ScreenView {
    /// Still starting, or a screen this file does not know
    Unknown { text: String },
    Trust(TrustChoice),
    Prompt(Prompt),
}

/// One screen row: all of its text, and only its plain (not dim) cells.
struct Row {
    text: String,
    plain: String,
    edge: Edge,
    /// The first character after the input indent takes two columns
    starts_wide: bool,
}

/// How a row ends at the right edge, which says whether a long input was cut there mid-word.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Edge {
    /// The last column holds a character, or the second half of a wide one.
    Full,
    /// The last column is empty after a character: cut there if the next row starts with a wide
    /// character, which did not fit into the one column left.
    OneShort,
    Open,
}

pub fn view_of(screen: &vt100::Screen) -> ScreenView {
    let rows = rows_of(screen);
    if let Some(choice) = trust_choice(&rows) {
        return ScreenView::Trust(choice);
    }
    match prompt_of(&rows) {
        Some(prompt) => ScreenView::Prompt(prompt),
        None => ScreenView::Unknown { text: summary_of(&rows) },
    }
}

fn rows_of(screen: &vt100::Screen) -> Vec<Row> {
    let (height, width) = screen.size();
    (0..height.get()).map(|row| row_of(screen, row, width.get())).collect()
}

fn row_of(screen: &vt100::Screen, row: u16, width: u16) -> Row {
    let mut text = String::new();
    let mut plain = String::new();
    for col in 0..width {
        let Some(cell) = screen.cell(row, col) else { continue };
        if cell.is_wide_continuation() {
            continue;
        }
        let contents = if cell.has_contents() { cell.contents() } else { " " };
        text.push_str(contents);
        // Indent and gaps stay, so the column of a character is still where it was.
        plain.push_str(if cell.dim() { " " } else { contents });
    }
    let starts_wide = screen.cell(row, INPUT_INDENT).is_some_and(vt100::Cell::is_wide);
    Row { text, plain, edge: edge_of(screen, row, width), starts_wide }
}

fn edge_of(screen: &vt100::Screen, row: u16, width: u16) -> Edge {
    let is_taken = |col: u16| screen.cell(row, col).is_some_and(|cell| cell.has_contents() || cell.is_wide_continuation());
    let is_letter = |col: u16| screen.cell(row, col).is_some_and(|cell| cell.has_contents() && cell.contents() != " ");
    if is_taken(width - 1) {
        Edge::Full
    } else if width >= 2 && is_letter(width - 2) {
        Edge::OneShort
    } else {
        Edge::Open
    }
}

fn trust_choice(rows: &[Row]) -> Option<TrustChoice> {
    let yes = rows.iter().find(|row| row.text.contains(TRUST_YES))?;
    let is_selected = yes.text.trim_start().starts_with(PROMPT_MARK);
    Some(if is_selected { TrustChoice::Yes } else { TrustChoice::No })
}

fn is_rule(row: &Row) -> bool {
    let line = row.text.trim();
    !line.is_empty() && line.chars().all(|c| c == RULE)
}

fn prompt_of(rows: &[Row]) -> Option<Prompt> {
    let rules: Vec<usize> = rows.iter().enumerate().filter(|(_, row)| is_rule(row)).map(|(i, _)| i).collect();
    let [.., top, bottom] = rules[..] else { return None };
    let input = &rows[top + 1..bottom];
    if !input.first()?.text.trim_start().starts_with(PROMPT_MARK) {
        return None;
    }
    let notice = top.checked_sub(1).map(|above| rows[above].text.trim().to_string()).unwrap_or_default();
    let footer: Vec<&str> = rows[bottom + 1..].iter().map(|row| row.text.as_str()).collect();
    Some(Prompt { text: input_text(input), phase: phase_of(&notice, &footer), notice })
}

/// The input rows as one line: a row filled to the edge was cut mid-word, any other one at a
/// space that the wrap swallowed.
fn input_text(input: &[Row]) -> String {
    let mut text = String::new();
    for (i, row) in input.iter().enumerate() {
        let line: String = row.plain.chars().skip(usize::from(INPUT_INDENT)).collect();
        let line = line.replace('\u{a0}', " ");
        let is_cut = i > 0 && is_cut_before(&input[i - 1], row);
        if !text.is_empty() && !is_cut {
            text.push(' ');
        }
        text.push_str(if is_cut { line.trim_end() } else { line.trim() });
    }
    text.trim().to_string()
}

fn is_cut_before(previous: &Row, row: &Row) -> bool {
    match previous.edge {
        Edge::Full => true,
        Edge::OneShort => row.starts_wide,
        Edge::Open => false,
    }
}

fn phase_of(notice: &str, footer: &[&str]) -> VoicePhase {
    let says = |mark: &str| notice.contains(mark) || footer.iter().any(|row| row.contains(mark));
    if says(TRANSCRIBING_MARK) {
        VoicePhase::Transcribing
    } else if says(LISTENING_MARK) {
        VoicePhase::Listening
    } else if says(WARMUP_MARK) {
        VoicePhase::Warmup
    } else {
        VoicePhase::Idle
    }
}

/// What a screen without a prompt says, for an error: its non-empty rows, shortened.
fn summary_of(rows: &[Row]) -> String {
    const MAX_CHARS: usize = 400;
    let lines: Vec<&str> = rows.iter().map(|row| row.text.trim()).filter(|line| !line.is_empty()).collect();
    lines.join(" / ").chars().take(MAX_CHARS).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const COLS: u16 = 60;
    const ROWS: u16 = 12;
    const DIM: &str = "\x1b[2m";
    const PLAIN: &str = "\x1b[22m";

    fn rule() -> String {
        RULE.to_string().repeat(usize::from(COLS))
    }

    /// A screen like Claude draws it: banner, notice, box, footer.
    fn screen(notice: &str, input: &[&str], footer: &str) -> vt100::Parser {
        let mut parser = vt100::Parser::new(ROWS.try_into().unwrap(), COLS.try_into().unwrap(), 0);
        let mut lines = vec![" ▐▛███▛█   Claude Code v2.1.332".to_string(), notice.to_string(), rule()];
        lines.extend(input.iter().map(|line| line.to_string()));
        lines.extend([rule(), footer.to_string()]);
        parser.process(lines.join("\r\n").as_bytes());
        parser
    }

    fn prompt(parser: &vt100::Parser) -> Prompt {
        match view_of(parser.screen()) {
            ScreenView::Prompt(prompt) => prompt,
            other => panic!("no prompt: {other:?}"),
        }
    }

    #[test]
    fn the_dim_placeholder_is_no_text() {
        let parser = screen("", &[&format!("❯\u{a0}{DIM}Try \"fix lint errors\"{PLAIN}")], "  ⏵⏵ auto mode on");
        assert_eq!(prompt(&parser).text, "");
    }

    #[test]
    fn reads_the_finished_transcript() {
        let parser = screen("◐ medium · /effort", &["❯\u{a0}Hallo Welt, das ist ein Test"], "  ⏵⏵ auto mode on");
        let prompt = prompt(&parser);
        assert_eq!(prompt.text, "Hallo Welt, das ist ein Test");
        assert_eq!(prompt.phase, VoicePhase::Idle);
        assert_eq!(prompt.notice, "◐ medium · /effort");
    }

    #[test]
    fn leaves_out_a_transcript_that_is_still_dim() {
        let parser = screen("listening…", &[&format!("❯\u{a0}fertig {DIM}noch nicht{PLAIN}")], "");
        assert_eq!(prompt(&parser).text, "fertig");
    }

    #[test]
    fn joins_rows_wrapped_at_a_space() {
        let parser = screen("", &["❯\u{a0}erste Zeile", "  zweite Zeile"], "");
        assert_eq!(prompt(&parser).text, "erste Zeile zweite Zeile");
    }

    #[test]
    fn joins_a_row_cut_mid_word_without_a_space() {
        let full = format!("❯\u{a0}{}", "a".repeat(usize::from(COLS - INPUT_INDENT)));
        let parser = screen("", &[&full, "  bc"], "");
        assert_eq!(prompt(&parser).text, format!("{}bc", "a".repeat(usize::from(COLS - INPUT_INDENT))));
    }

    #[test]
    fn joins_a_row_that_ends_in_a_wide_character_without_a_space() {
        let full = format!("❯\u{a0}{}漢", "a".repeat(usize::from(COLS - INPUT_INDENT - 2)));
        let parser = screen("", &[&full, "  字"], "");
        assert_eq!(prompt(&parser).text, format!("{}漢字", "a".repeat(usize::from(COLS - INPUT_INDENT - 2))));
    }

    #[test]
    fn joins_a_row_wrapped_early_for_a_wide_character_without_a_space() {
        let short = format!("❯\u{a0}{}", "a".repeat(usize::from(COLS - INPUT_INDENT - 1)));
        let parser = screen("", &[&short, "  漢字"], "");
        assert_eq!(prompt(&parser).text, format!("{}漢字", "a".repeat(usize::from(COLS - INPUT_INDENT - 1))));
    }

    #[test]
    fn keeps_the_space_when_a_row_one_short_continues_with_a_narrow_word() {
        let short = format!("❯\u{a0}{}", "a".repeat(usize::from(COLS - INPUT_INDENT - 1)));
        let parser = screen("", &[&short, "  bc"], "");
        assert_eq!(prompt(&parser).text, format!("{} bc", "a".repeat(usize::from(COLS - INPUT_INDENT - 1))));
    }

    #[test]
    fn tells_the_voice_phases_apart() {
        let cases = [
            ("◐ medium · /effort", "  ⏵⏵ auto mode on · keep holding…", VoicePhase::Warmup),
            ("listening…", "  ⏵⏵ auto mode on", VoicePhase::Listening),
            ("Transcribing…", "  ⏵⏵ auto mode on", VoicePhase::Transcribing),
            ("  No speech detected", "  ⏵⏵ auto mode on", VoicePhase::Idle),
        ];
        for (notice, footer, phase) in cases {
            assert_eq!(prompt(&screen(notice, &["❯\u{a0}"], footer)).phase, phase, "{notice} / {footer}");
        }
    }

    #[test]
    fn words_in_the_input_are_no_phase() {
        let parser = screen("", &["❯\u{a0}I was listening… and keep holding"], "");
        assert_eq!(prompt(&parser).phase, VoicePhase::Idle);
    }

    #[test]
    fn sees_which_trust_answer_is_selected() {
        let mut parser = vt100::Parser::new(ROWS.try_into().unwrap(), COLS.try_into().unwrap(), 0);
        parser.process("Accessing workspace:\r\n\r\n❯ No, exit\r\n  Yes, I trust this folder".as_bytes());
        assert_eq!(view_of(parser.screen()), ScreenView::Trust(TrustChoice::No));
        parser.process("\x1b[3;1H  No, exit\r\n❯ Yes, I trust this folder".as_bytes());
        assert_eq!(view_of(parser.screen()), ScreenView::Trust(TrustChoice::Yes));
    }

    #[test]
    fn a_screen_without_a_box_is_unknown() {
        let mut parser = vt100::Parser::new(ROWS.try_into().unwrap(), COLS.try_into().unwrap(), 0);
        parser.process(b"Welcome\r\n\r\nPlease log in");
        assert_eq!(view_of(parser.screen()), ScreenView::Unknown { text: "Welcome / Please log in".into() });
    }
}
