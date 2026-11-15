export const factKinds = ['summary', 'skill', 'experience', 'achievement', 'education'] as const;
export type FactKind = (typeof factKinds)[number];
export interface Fact {
  id: string;
  kind: FactKind;
  title: string;
  context: string;
  text: string;
  approved: boolean;
}
export interface ProfileContent {
  name: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  website: string;
  facts: Fact[];
}
export interface Profile {
  revision: number;
  content: ProfileContent;
}
export interface Block {
  factId: string;
  kind: FactKind;
  title: string;
  context: string;
  text: string;
}
export interface ResumeContent {
  headline: string;
  blocks: Block[];
}
export const requirementKinds = ['mandatory', 'preferred', 'responsibility', 'constraint'] as const;
export const evidenceStates = [
  'supported',
  'partially_supported',
  'needs_confirmation',
  'unsupported',
] as const;
export interface Requirement {
  id: string;
  quote: string;
  kind: (typeof requirementKinds)[number];
  state: (typeof evidenceStates)[number];
  factIds: string[];
}
export interface VersionSummary {
  id: string;
  number: number;
  artifactId: string;
  name?: string;
  createdAt?: string;
}
export interface DraftSummary {
  id: string;
  name: string;
  revision: number;
  updatedAt: string;
  versions: VersionSummary[];
}
export interface Change {
  field: string;
  before: string;
  after: string;
}
export interface Draft extends DraftSummary {
  profileRevision: number;
  profileSnapshot: ProfileContent;
  vacancySnapshot: { id: string; title: string; company: string; description: string; url: string };
  content: ResumeContent;
  baseline: ResumeContent;
  requirements: Requirement[];
  diff: Change[];
  parentVersionId?: string;
}
export interface Version {
  id: string;
  name: string;
  number: number;
  createdAt: string;
  parentVersionId?: string;
  artifactId: string;
  artifact: { id: string; name: string; size: number; checksum: string };
  profileSnapshot: ProfileContent;
  vacancySnapshot: Draft['vacancySnapshot'];
  content: ResumeContent;
  requirements: Requirement[];
  acceptedDiff: Change[];
}
export const emptyProfile: ProfileContent = {
  name: '',
  headline: '',
  email: '',
  phone: '',
  location: '',
  website: '',
  facts: [],
};
