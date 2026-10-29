import test from 'node:test';
import assert from 'node:assert/strict';
import { addLabels } from '../src/tag-rules.ts';
test('type replacement preserves labels and exactly one type',()=>{
 assert.deepEqual(addLabels(['task','school'],['note']),['note','school']);
 assert.deepEqual(addLabels(['note','school'],['task','event','school','idea']),['event','school','idea']);
});
test('labels trim, deduplicate, and stay case sensitive',()=>{
 assert.deepEqual(addLabels(['note','idea'],[' idea ','Note','']),['note','idea','Note']);
});
