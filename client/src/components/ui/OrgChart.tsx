import React from 'react';
import { Tree, TreeNode } from 'react-organizational-chart';

interface OrgChartProps<T> {
  data: T;
  renderNode: (node: T) => React.ReactNode;
  getChildren: (node: T) => T[] | undefined;
  onNodeClick?: (node: T) => void;
}

/**
 * OrgChart Component
 * Recursive tree visualization component for organizational structures.
 * Based on react-organizational-chart.
 */
export function OrgChart<T>({
  data,
  renderNode,
  getChildren,
  onNodeClick,
}: OrgChartProps<T>) {
  const renderTree = (node: T) => {
    const children = getChildren(node);
    const hasChildren = children && children.length > 0;

    return (
      <TreeNode
        key={(node as any)._id}
        label={
          <div
            onClick={() => onNodeClick?.(node)}
            className="inline-block cursor-pointer"
          >
            {renderNode(node)}
          </div>
        }
      >
        {hasChildren && children.map((child) => renderTree(child))}
      </TreeNode>
    );
  };

  return (
    <div className="overflow-auto p-8 flex justify-center">
      <Tree
        lineWidth={'2px'}
        lineColor={'#E2E6ED'}
        lineBorderRadius={'10px'}
        label={
          <div
            onClick={() => onNodeClick?.(data)}
            className="inline-block cursor-pointer"
          >
            {renderNode(data)}
          </div>
        }
      >
        {getChildren(data)?.map((child) => renderTree(child))}
      </Tree>
    </div>
  );
}
