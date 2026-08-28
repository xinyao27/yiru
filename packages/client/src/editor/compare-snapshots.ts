import type {
  BranchCompareLike,
  BranchCompareSnapshot,
  CommitCompareLike,
  CommitCompareSnapshot
} from './file-model'

function getCompareVersion(
  compare: Pick<BranchCompareLike, 'baseOid' | 'headOid' | 'mergeBase'>
): string {
  return [
    compare.baseOid ?? 'no-base',
    compare.headOid ?? 'no-head',
    compare.mergeBase ?? 'no-merge-base'
  ].join(':')
}

export function toBranchCompareSnapshot(compare: BranchCompareLike): BranchCompareSnapshot {
  return {
    baseRef: compare.baseRef,
    baseOid: compare.baseOid,
    compareRef: compare.compareRef,
    headOid: compare.headOid,
    mergeBase: compare.mergeBase,
    compareVersion: getCompareVersion(compare)
  }
}

export function toCommitCompareSnapshot(
  compare: CommitCompareLike,
  subject?: string,
  message?: string
): CommitCompareSnapshot {
  return {
    commitOid: compare.commitOid,
    parentOid: compare.parentOid,
    compareRef: compare.compareRef,
    baseRef: compare.baseRef,
    compareVersion: `${compare.parentOid ?? 'empty-tree'}:${compare.commitOid}`,
    subject:
      subject ??
      ('subject' in compare && typeof compare.subject === 'string' ? compare.subject : undefined),
    message:
      message ??
      ('message' in compare && typeof compare.message === 'string' ? compare.message : undefined)
  }
}
