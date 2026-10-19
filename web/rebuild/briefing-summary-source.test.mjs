import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {briefingSourceURL,briefingSourceLink} from './features.mjs';

test('briefing renderer retains processed summaries and contains no audio playback path',async()=>{
 const source=await readFile(new URL('./features.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/episodeAudioURL|episodeEmbedURL|briefingAudioDock|<audio controls|briefing-audio-embed/);
 assert.match(source,/summaryData\.bullish_points/);
 assert.match(source,/summaryData\.bearish_points/);
 assert.match(source,/summaryData\.core_targets/);
 assert.match(source,/summaryData\.trading_advice/);
 assert.match(source,/briefingSourceLink\(episode\)/);
});

test('briefing source URL and link accept only absolute HTTP(S) URLs and escape output',()=>{
 const episode={source_url:'https://example.test/episode?id=1&title=good'};
 assert.equal(briefingSourceURL(episode),episode.source_url);
 assert.match(briefingSourceLink(episode),/href="https:\/\/example\.test\/episode\?id=1&amp;title=good"/);
 assert.match(briefingSourceLink(episode),/rel="noopener noreferrer"/);
 for(const source_url of [undefined,'javascript:alert(1)','file:///tmp/episode','https:']){
  assert.equal(briefingSourceURL({source_url}),null);
  assert.match(briefingSourceLink({source_url}),/來源連結不足/);
 }
});
