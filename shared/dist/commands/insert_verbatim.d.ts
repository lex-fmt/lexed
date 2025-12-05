import { Command } from '../types.js';
export interface InsertVerbatimArgs {
    content: string;
    language: string;
}
export declare const InsertVerbatimCommand: Command<InsertVerbatimArgs>;
