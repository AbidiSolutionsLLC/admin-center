// src/features/organization/hooks/useMoveDepartment.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from 'sonner';
import axios from 'axios';
import type { OrgTreeNode } from '@/types';

interface MoveDepartmentVariables {
  id: string;
  parent_id: string | null;
  oldParentId: string | null;
}

/**
 * Moves a department to a new parent in the hierarchy.
 * Features optimistic UI updates with automatic rollback on failure.
 * Produces audit event: department.moved
 * Used on: OrganizationPage (drag-and-drop org chart).
 */
export const useMoveDepartment = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, MoveDepartmentVariables>({
    mutationFn: async ({ id, parent_id }) => {
      await apiClient.put(`/organization/${id}/move`, { parent_id });
    },
    // Optimistic update: update cache before API call
    onMutate: async ({ id, parent_id, oldParentId }) => {
      // Cancel outgoing refetches to prevent overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.ORG_TREE });

      // Snapshot current cache for rollback
      const previousTree = queryClient.getQueryData<OrgTreeNode[]>(QUERY_KEYS.ORG_TREE);

      // Optimistically update the tree
      if (previousTree) {
        const updatedTree = moveNodeInTree(previousTree, id, parent_id);
        queryClient.setQueryData(QUERY_KEYS.ORG_TREE, updatedTree);
      }

      return { previousTree };
    },
    // On success, invalidate queries to refetch fresh data
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ORG_TREE });
      toast.success('Department moved successfully');
    },
    // On error, rollback to previous state and show error toast
    onError: (error, _variables, context) => {
      // Rollback optimistic update
      if (context?.previousTree) {
        queryClient.setQueryData(QUERY_KEYS.ORG_TREE, context.previousTree);
      }

      // Show user-friendly error message
      if (axios.isAxiosError(error) && error.response?.data?.code === 'CIRCULAR_HIERARCHY') {
        toast.error(error.response.data.error || 'Cannot move department to its own descendant');
      } else {
        toast.error('Failed to move department. The change has been reverted.');
      }
    },
    // Always refetch after error or success
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ORG_TREE });
    },
  });
};

/**
 * Helper: Recursively moves a node to a new parent in the tree.
 * Returns a new tree with the node moved (immutable update).
 */
function moveNodeInTree(
  tree: OrgTreeNode[],
  nodeId: string,
  newParentId: string | null
): OrgTreeNode[] {
  // Deep clone to avoid mutating original
  const newTree = structuredClone(tree);

  // Find and remove the node from its current position
  let nodeToMove: OrgTreeNode | null = null;

  function removeNode(nodes: OrgTreeNode[]): OrgTreeNode[] {
    return nodes
      .filter((node) => {
        if (node._id === nodeId) {
          nodeToMove = node;
          return false; // Remove this node
        }
        return true;
      })
      .map((node) => ({
        ...node,
        children: node.children ? removeNode(node.children) : [],
      }));
  }

  const treeWithoutNode = removeNode(newTree);

  if (!nodeToMove) return tree; // Node not found, return original

  // Update the node's parent_id
  nodeToMove.parent_id = newParentId;

  // If newParentId is null, add to root level
  if (!newParentId) {
    return [...treeWithoutNode, nodeToMove];
  }

  // Otherwise, add to the new parent's children
  function addToParent(nodes: OrgTreeNode[]): OrgTreeNode[] {
    return nodes.map((node) => {
      if (node._id === newParentId) {
        return {
          ...node,
          children: [...(node.children || []), nodeToMove!],
        };
      }
      if (node.children) {
        return {
          ...node,
          children: addToParent(node.children),
        };
      }
      return node;
    });
  }

  return addToParent(treeWithoutNode);
}
