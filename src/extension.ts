import { window as Window, ExtensionContext, Range, Position, TextDocument, ThemeColor } from 'vscode';

const VALID_SECTION_CHARACTERS = new Set([
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w',
  'x', 'y', 'z', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T',
  'U', 'V', 'W', 'X', 'Y', 'Z', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '_', '-', '.'
]);
const OPEN_SECTION_SYMBOLS_REGEX = /{|}|#|\^/g;
const CLOSED_SECTION_SYMBOLS_REGEX = /{|}|\^|\//g;

export function activate(context: ExtensionContext) {
  const editorDecoration = Window.createTextEditorDecorationType({
    backgroundColor: new ThemeColor('editor.wordHighlightTextBackground')
  });

  const selectionEvent = Window.onDidChangeTextEditorSelection((event) => {
    if (event.selections.length === 1) {
      const cursorPos = event.selections[0].active;

      const rangeToHighlight = getRangeToHighlight(event.textEditor.document, cursorPos);

      event.textEditor.setDecorations(editorDecoration, [rangeToHighlight]);
    }
  });

  context.subscriptions.push(selectionEvent);
}

function getRangeToHighlight(document: TextDocument, cursorPos: Position): Range {
  const previousChar = getPreviousChar(cursorPos, document);
  const currentChar = document.getText(new Range(cursorPos, new Position(cursorPos.line, cursorPos.character+1)));

  const threeClosedCurlyBrackets = '}}}';
  const twoClosedCurlyBrackets = '}}';
  
  let openingSection: string | undefined;

  if (previousChar === '}' && currentChar !== '}') {
    const textBeforeCursor = getInlineTextBeforeCursor(cursorPos, document);

    if (textBeforeCursor.endsWith(threeClosedCurlyBrackets) && textBeforeCursor.length > threeClosedCurlyBrackets.length) {
      openingSection = getTrailingOpeningSection(textBeforeCursor, threeClosedCurlyBrackets.length);
    } else if (textBeforeCursor.endsWith(twoClosedCurlyBrackets) && textBeforeCursor.length > twoClosedCurlyBrackets.length) {
      openingSection = getTrailingOpeningSection(textBeforeCursor, twoClosedCurlyBrackets.length);
    }

    if (openingSection !== undefined) {
      return findRangeToEnclosingSection(cursorPos, document, openingSection);
    }
  }

  return new Range(new Position(0, 0), new Position(0, 0));
}

function getPreviousChar(cursorPos: Position, document: TextDocument): string {
  const prevCharRange = new Range(new Position(cursorPos.line, cursorPos.character-1), cursorPos);
  return document.getText(prevCharRange);
}

function getInlineTextBeforeCursor(cursorPos: Position, document: TextDocument) {
  const inlineRangeUpToCursor = new Range(new Position(cursorPos.line, 0), cursorPos);
  return document.getText(inlineRangeUpToCursor);
}

function getTrailingOpeningSection(textBeforeCursor: string, numOfBrackets: number): string | undefined {
  const openCurlyBrackets = numOfBrackets === 2 ? '{{' : '{{{';
  let openingSection: string | undefined;
  let hasAtleastOneChar = false;
  let hasSectionSymbol = false;
  let prevCharacter = '';

  for (let charIndex = textBeforeCursor.length - numOfBrackets - 1; charIndex >= 0; charIndex--) {
    const character = textBeforeCursor[charIndex];
    const closesCorrectly =
      hasSectionSymbol && charIndex-(numOfBrackets-1) >= 0 &&
      textBeforeCursor.slice(charIndex-(numOfBrackets-1), charIndex+1) === openCurlyBrackets;

    if (closesCorrectly) {
      openingSection = textBeforeCursor.slice(charIndex-(numOfBrackets-1));
      break;
    } else if (hasSectionSymbol && character === ' ') {
      prevCharacter = character;
    } else if (hasSectionSymbol && VALID_SECTION_CHARACTERS.has(character)) {
      break;
    } else if (hasAtleastOneChar && !hasSectionSymbol && (character === '#' || character === '^')) {
      prevCharacter = character;
      hasSectionSymbol = true;
    } else if (hasAtleastOneChar && prevCharacter !== ' ' && VALID_SECTION_CHARACTERS.has(character)) {
      prevCharacter = character;
    } else if (hasAtleastOneChar && character === ' ') {
      prevCharacter = character;
    } else if (!hasAtleastOneChar && VALID_SECTION_CHARACTERS.has(character)) {
      prevCharacter = character;
      hasAtleastOneChar = true;
    } else if (!hasAtleastOneChar && character === ' ') {
      prevCharacter = character;
    } else {
      break;
    }
  }

  return openingSection;
}

function findRangeToEnclosingSection(currPos: Position, document: TextDocument, openingSection: string): Range {
    const documentArray = document.getText().split('\n');
    let initialCharIndex = currPos.character;

    for (let lineIndex = currPos.line; lineIndex < documentArray.length; lineIndex++) {
      for (let charIndex = initialCharIndex; charIndex < documentArray[lineIndex].length; charIndex++) {
        if (documentArray[lineIndex][charIndex] === '{') {
          const textAfterPointer = documentArray[lineIndex].slice(charIndex);

          if(isMatchingClosingSection(textAfterPointer, openingSection)) {
            return new Range(new Position(currPos.line, currPos.character), new Position(lineIndex, charIndex));
          }
        }
      }

      initialCharIndex = 0; // Start at the beginning of the next line
    }

    return new Range(new Position(0, 0), new Position(0, 0));
}

function isMatchingClosingSection(textAfterPointer: string, openingSection: string): boolean {
  const openSectionName = openingSection.replaceAll(OPEN_SECTION_SYMBOLS_REGEX, '');
  const closeSectionSymbols = openingSection.includes('#') ? ['^', '/'] : ['/'];
  const numOfBrackets = (openingSection.match(/{/g) || []).length;
  const closedCurlyBrackets = numOfBrackets === 2 ? '}}' : '}}}';
  const openCurlyBrackets = numOfBrackets === 2 ? '{{' : '{{{';

  if (textAfterPointer.slice(0, numOfBrackets) !== openCurlyBrackets) {
    return false;
  }

  let hasAtleastOneChar = false;
  let hasCharSectionSymbol = false;
  let prevCharacter = '';
  
  for (let charIndex = numOfBrackets; charIndex < textAfterPointer.length; charIndex++) {
    const character = textAfterPointer[charIndex];

    const closesCorrectly =
      hasAtleastOneChar && charIndex + numOfBrackets - 1 < textAfterPointer.length &&
      textAfterPointer.slice(charIndex, charIndex + numOfBrackets) === closedCurlyBrackets;
    const hasWhitespaceAfterValidChar = hasAtleastOneChar && character === ' ';
    const validCharFollowsValidChar = 
      hasAtleastOneChar && 
      VALID_SECTION_CHARACTERS.has(prevCharacter) && 
      VALID_SECTION_CHARACTERS.has(character);
    const hasWhiteSpaceBeforeValidChar = !hasAtleastOneChar && character === ' ';

    if (closesCorrectly) {
      return openSectionName === getClosedSectionName(textAfterPointer, charIndex, numOfBrackets);
    } else if (hasWhitespaceAfterValidChar || validCharFollowsValidChar || hasWhiteSpaceBeforeValidChar) {
      prevCharacter = character;
    } else if (!hasAtleastOneChar && hasCharSectionSymbol && VALID_SECTION_CHARACTERS.has(character)) {
      hasAtleastOneChar = true;
      prevCharacter = character;
    } else if (!hasCharSectionSymbol && closeSectionSymbols.includes(character)) {
      hasCharSectionSymbol = true;
      prevCharacter = character;
    } else {
      return false;
    }
  }

  return false;
}

function getClosedSectionName(textAfterPointer: string, charIndex: number, numOfBrackets: number): string {
  const closedSection = textAfterPointer.slice(0, charIndex + numOfBrackets);
  return closedSection.replaceAll(CLOSED_SECTION_SYMBOLS_REGEX, '');
}
