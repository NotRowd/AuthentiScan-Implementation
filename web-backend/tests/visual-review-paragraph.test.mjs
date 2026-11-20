import {test} from 'node:test';
import assert from 'node:assert/strict';
import {visualReviewParagraph,REVIEW_CLEAR,REVIEW_FAILED,REVIEW_UNCERTAIN} from '../shared/visual-review-paragraph.mjs';
const base=()=>({findings:['eyes','shape','texture','lighting','scene'].map(category=>({category,status:'no_clear_concern',observation:'',location:'',reason:''}))});

test('clear, partially assessed and failed reviews stay distinct',()=>{
  const review=base();
  assert.equal(visualReviewParagraph(review),REVIEW_CLEAR);
  review.findings[0].status='unable_to_assess';
  assert.match(visualReviewParagraph(review),/Some details were too small or hidden/);
  review.findings.forEach(item=>item.status='unable_to_assess');
  assert.equal(visualReviewParagraph(review),REVIEW_UNCERTAIN);
  assert.notEqual(visualReviewParagraph(review),REVIEW_FAILED);
  assert.doesNotMatch(visualReviewParagraph(review),/try again/i);
  assert.doesNotMatch(visualReviewParagraph(review),/Nothing clearly/);
});
test('art style does not become a claim of AI or human authorship',()=>{
  const text=visualReviewParagraph({...base(),image_type:'illustration'});
  assert.match(text,/part of its style and do not mean it is AI-generated/);
  assert.doesNotMatch(text,/human-made|is authentic|(?:^|\. )This (?:image|artwork) is AI-generated/);
});
test('a paragraph preserves the actual detail and reason regardless of verdict',()=>{
  const review=base();
  review.findings[4]={category:'scene',status:'possible_concern',observation:'The goat at the center appears to carry an adult.',location:'Center of the image',reason:'Its front legs seem to hold the person like human arms.'};
  const text=visualReviewParagraph(review);
  assert.ok(text.includes(review.findings[4].observation));
  assert.ok(text.includes(review.findings[4].reason));
  for(const verdict of ['authentic','ai_generated','uncertain'])assert.equal(visualReviewParagraph({...review,verdict}),text);
  assert.doesNotMatch(text,/What:|Where:|Why:|proves/);
});
