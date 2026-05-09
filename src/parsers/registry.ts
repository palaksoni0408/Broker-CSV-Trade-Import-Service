import type { BrokerParser } from "./parser.interface.js";
import { ZerodhaParser } from "./zerodha.parser.js";
import { IbkrParser } from "./ibkr.parser.js";

/**
 * Registry of all supported broker parsers.
 *
 * To add a new broker:
 * 1. Create a new class implementing BrokerParser
 * 2. Import it here and add an instance to this array
 * 3. That's it — auto-detection and routing happen automatically
 */
export const parserRegistry: BrokerParser[] = [
  new ZerodhaParser(),
  new IbkrParser(),
];
