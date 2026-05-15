export type NodeId = string;
export type EdgeId = string;
export type OpId = string;

export interface RichText {
  type: 'doc';
  content?: RichTextNode[];
}

export interface RichTextNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown> | null;
  content?: RichTextNode[];
  marks?: RichTextMark[];
}

export interface RichTextMark {
  type: string;
  attrs?: Record<string, unknown> | null;
}

export interface Doc {
  version: 1;
  rootId: NodeId;
  nodes: Record<NodeId, MindNode>;
  edges: Record<EdgeId, FreeEdge>;
  theme: string;
  meta: {
    title: string;
    createdAt: number;
    updatedAt: number;
  };
}

export interface MindNode {
  id: NodeId;
  parentId: NodeId | null;
  childIds: NodeId[];
  content: RichText;
  collapsed?: boolean;
  note?: RichText;
  icon?: string;
  color?: string;
  side?: 'left' | 'right';
}

export interface FreeEdge {
  id: EdgeId;
  fromNodeId: NodeId;
  toNodeId: NodeId;
  label?: string;
  style?: 'solid' | 'dashed';
}

export type OpOrigin = 'canvas' | 'outline' | 'ai' | 'io' | 'history' | 'remote' | 'test';

export interface ApplyContext {
  origin: OpOrigin;
  timestamp: number;
  history: 'record' | 'skip';
}

export interface BaseDocOperation {
  id: OpId;
  type: string;
}

export interface NodePayload {
  id: NodeId;
  content: RichText;
  collapsed?: boolean;
  note?: RichText;
  icon?: string;
  color?: string;
  side?: 'left' | 'right';
}

export interface InsertNodeOp extends BaseDocOperation {
  type: 'insertNode';
  node: NodePayload;
  parentId: NodeId | null;
  index: number;
}

export interface DeleteSubtreeOp extends BaseDocOperation {
  type: 'deleteSubtree';
  nodeId: NodeId;
}

export interface MoveNodeOp extends BaseDocOperation {
  type: 'moveNode';
  nodeId: NodeId;
  newParentId: NodeId;
  index: number;
}

export interface UpdateContentOp extends BaseDocOperation {
  type: 'updateContent';
  nodeId: NodeId;
  content: RichText;
}

export interface SetCollapsedOp extends BaseDocOperation {
  type: 'setCollapsed';
  nodeId: NodeId;
  collapsed: boolean | undefined;
}

export interface UpdateNodeMetaOp extends BaseDocOperation {
  type: 'updateNodeMeta';
  nodeId: NodeId;
  patch: Partial<Pick<MindNode, 'note' | 'icon' | 'color' | 'side'>>;
}

export interface AddFreeEdgeOp extends BaseDocOperation {
  type: 'addFreeEdge';
  edge: FreeEdge;
}

export interface UpdateFreeEdgeOp extends BaseDocOperation {
  type: 'updateFreeEdge';
  edgeId: EdgeId;
  patch: Partial<Pick<FreeEdge, 'label' | 'style'>>;
}

export interface DeleteFreeEdgeOp extends BaseDocOperation {
  type: 'deleteFreeEdge';
  edgeId: EdgeId;
}

export interface SetThemeOp extends BaseDocOperation {
  type: 'setTheme';
  theme: string;
}

export type DocOperation =
  | InsertNodeOp
  | DeleteSubtreeOp
  | MoveNodeOp
  | UpdateContentOp
  | SetCollapsedOp
  | UpdateNodeMetaOp
  | AddFreeEdgeOp
  | UpdateFreeEdgeOp
  | DeleteFreeEdgeOp
  | SetThemeOp;

export type CoreErrorCode =
  | 'NODE_NOT_FOUND'
  | 'EDGE_NOT_FOUND'
  | 'INVALID_PARENT'
  | 'CYCLE_DETECTED'
  | 'DUPLICATE_CHILD'
  | 'DUPLICATE_NODE'
  | 'INVALID_RICH_TEXT'
  | 'VALIDATION_FAILED'
  | 'INVALID_OPERATION';

export interface CoreError {
  code: CoreErrorCode;
  message: string;
  opId?: OpId;
  nodeId?: NodeId;
  edgeId?: EdgeId;
  path?: string;
}

export interface ValidationIssue {
  code: CoreErrorCode;
  message: string;
  path: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

export interface ApplyResult {
  ok: boolean;
  doc?: Doc;
  inverseOps?: DocOperation[];
  validation?: ValidationResult;
  error?: CoreError;
}

export type Unsubscribe = () => void;
