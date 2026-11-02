import { useMutation } from 'convex/react';
import { api } from './api';
export function useAgeGroupActions() { return { setAgeGroup: useMutation(api.family.setAgeGroup), approveConnections: useMutation(api.family.approveConnections) }; }
