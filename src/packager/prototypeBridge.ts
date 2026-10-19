/**
 * In-memory handoff from Prototype Workshop to the staging packager.
 * Only references, never installed game mutations.
 */
import { type ArtList } from '../registry/core';
import {
  buildPrototypeList, createItemPro, proposalMessages, reviewDraft,
  type ItemDraft, type PrototypeList, type TargetGame,
} from '../prototype/core';
import { type StagedResource, type ClassicTarget, validateBundle } from './core';

export interface PrototypeHandoff {
  id: string;
  target: ClassicTarget;
  resources: StagedResource[];
}

export function makePrototypeHandoff(
  target: TargetGame, draft: ItemDraft, proto: PrototypeList | null,
  art: ArtList | null, messages?: Set<number>,
): PrototypeHandoff {
  const review=reviewDraft(draft,proto,art,messages);
  if(review.problems.length || !proto || !art) {
    throw new Error(review.problems.join('\n') || 'Both source lists are required.');
  }
  const prefix='prototype-'+review.pid;
  const resources:StagedResource[]=[
    {id:prefix+'-pro',name:review.filename,kind:'pro',origin:'prototype-workshop',
      bytes:createItemPro(draft,review)},
    {id:prefix+'-list',name:'proto-items.proposed.lst',kind:'proto-lst',origin:'prototype-workshop',
      bytes:buildPrototypeList(proto)},
    {id:prefix+'-msg',name:'pro_item.additions.msg',kind:'pro-msg',origin:'prototype-workshop',
      bytes:proposalMessages(draft,review)},
    {id:prefix+'-art',name:'items.lst',kind:'lst',origin:'prototype-workshop',
      bytes:art.original.slice()},
  ];
  const issues=validateBundle(resources,target,'Original Prototype Review');
  const errors=issues.filter(x=>x.level==='error');
  if(errors.length)throw new Error(errors.map(x=>x.message).join('\n'));
  return {id:prefix+'-'+Date.now(),target,resources};
}
