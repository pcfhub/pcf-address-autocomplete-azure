/**
 * **TEMPORARY. Delete this file and its two lines in `index.ts` before 0.1.0
 * is built.** It ships no behaviour. It exists to answer the questions under
 * *Not verified* in `SPEC.md` that only a real form can — what an unmapped
 * optional bound property looks like, and what the platform hands back after
 * a write.
 *
 * Passive: one `console.log` per instance of the shape of every bound
 * parameter, and one per `updateView` of which bound values changed since the
 * last pass (the echo). Active: `window.__addressProbe` with `outputs()` so
 * the last `getOutputs()` can be read from the console beside a Web API
 * read-back of the record.
 */

import { IInputs } from './generated/ManifestTypes';

/* eslint-disable @typescript-eslint/no-explicit-any */

const TAG = '[address-autocomplete probe 0.0.2]';
const COLUMNS = ['addressLine1', 'city', 'stateOrProvince', 'postalCode', 'country', 'latitude', 'longitude'] as const;

let reported = false;
let passes = 0;
let previous: Record<string, unknown> = {};

export function probe(context: ComponentFramework.Context<IInputs>, outputs: () => unknown): void {
    passes += 1;

    const parameters = context.parameters as any;
    const current: Record<string, unknown> = {};

    COLUMNS.forEach((name) => {
        current[name] = parameters[name]?.raw;
    });

    if (!reported) {
        reported = true;

        console.log(TAG, 'bound parameters on first pass', Object.fromEntries(COLUMNS.map((name) => {
            const p = parameters[name];

            return [name, p === undefined ? 'ABSENT' : {
                raw: p.raw,
                type: p.type,
                keys: Object.keys(p),
                attributes: p.attributes ? { LogicalName: p.attributes.LogicalName, DisplayName: p.attributes.DisplayName } : p.attributes,
                security: p.security,
                error: p.error,
            }];
        })));

        (window as any).__addressProbe = { context, outputs };
        console.log(TAG, 'window.__addressProbe parked: __addressProbe.outputs() is the last getOutputs(); read the record back with the Web API after a pick and a Save.');
    }

    const changed = COLUMNS.filter((name) => current[name] !== previous[name]);

    if (passes > 1 && changed.length > 0) {
        console.log(TAG, `pass ${passes}: platform handed down new values for`, changed.map((name) => `${name}=${JSON.stringify(current[name])}`).join(', '));
    }

    previous = current;
}
