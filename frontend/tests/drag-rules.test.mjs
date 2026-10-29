import test from 'node:test';
import assert from 'node:assert/strict';
import { dragStarted, validDrop } from '../src/drag-rules.ts';
test('small pointer motion stays a click; five pixels begins full-card drag',()=>{
 assert.equal(dragStarted(12,12,10,10),false);
 assert.equal(dragStarted(13,14,10,10),true);
});
test('trash accepts all activity types, columns only tasks, background cancels',()=>{
 for(const type of ['note','event','task']) assert.equal(validDrop(true,undefined,type),true);
 assert.equal(validDrop(false,'done','task'),true);
 assert.equal(validDrop(false,'done','note'),false);
 assert.equal(validDrop(false,undefined,'task'),false);
 assert.equal(validDrop(false,'invalid','task'),false);
});
