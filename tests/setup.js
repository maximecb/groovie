// Test setup, loaded before every test file by tools/run_tests.sh.
//
// The model and the audio engine state their preconditions with
// console.assert, which only prints. That's what we want in the browser: a
// broken invariant shouldn't take the page down under someone who is in the
// middle of writing a beat. In a test it has to count for something, or a test
// that trips one would pass while printing "Assertion failed" into the void.
//
// So console.assert is replaced here with a version that records failures and
// fails the test they happened in. It records rather than throws on purpose:
// throwing would cut a function short of where the browser would carry on, and
// then the tests wouldn't be exercising the code that actually ships.

import { afterEach } from "node:test";

// Assertion failures seen since they were last looked at
let failures = [];

console.assert = function (cond, ...args)
{
    if (cond)
        return;

    // No call site passes a message, so the stack is what says which assert
    // this was. Frame 0 is the Error, frame 1 is this function, frame 2 is
    // whoever called console.assert.
    let stack = new Error().stack.split('\n');
    let where = stack[2]? stack[2].trim() : 'unknown location';

    failures.push((args.join(' ') || 'assertion failed') + '\n    ' + where);
};

// Take the recorded failures, leaving none behind. This is how a test says it
// expected an assert to fire: draining them keeps the check below quiet, and
// the count returned is what the test asserts on.
export function drain_asserts()
{
    let drained = failures;
    failures = [];

    return drained;
}

// Fail the test that tripped an assert. Asserts that fire while a module is
// being imported land on the first test of the file rather than on anything
// that ran them, which the location in the message is there to sort out.
afterEach(() =>
{
    let drained = drain_asserts();

    if (drained.length > 0)
        throw new Error('console.assert failed:\n  ' + drained.join('\n  '));
});
