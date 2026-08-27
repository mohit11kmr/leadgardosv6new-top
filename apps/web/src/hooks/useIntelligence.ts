import { useQuery } from '@tanstack/react-query';
import {
  getBusinessImpact,
  getExecutiveSummary,
  getFunnelSimulation,
  getRevenueScenarios,
  getScoreExplanation,
  getWhatsAppOptimization,
  type BusinessImpactResponse,
  type ExecutiveSummaryResponse,
  type FunnelSimulationResponse,
  type RevenueScenariosResponse,
  type ScoreExplanationResponse,
  type WhatsAppOptimizationResponse,
} from '../api/intelligence.js';

export function useScoreExplanation(auditId: string | undefined) {
  return useQuery<ScoreExplanationResponse>({
    queryKey: ['score-explanation', auditId],
    queryFn: () => getScoreExplanation(auditId!),
    enabled: Boolean(auditId),
  });
}

export function useBusinessImpact(auditId: string | undefined) {
  return useQuery<BusinessImpactResponse>({
    queryKey: ['business-impact', auditId],
    queryFn: () => getBusinessImpact(auditId!),
    enabled: Boolean(auditId),
  });
}

export function useExecutiveSummary(auditId: string | undefined) {
  return useQuery<ExecutiveSummaryResponse>({
    queryKey: ['executive-summary', auditId],
    queryFn: () => getExecutiveSummary(auditId!),
    enabled: Boolean(auditId),
  });
}

export function useRevenueScenarios(
  auditId: string | undefined,
  inputs?: { monthlyVisitors?: number; conversionRate?: number; averageLeadValue?: number }
) {
  return useQuery<RevenueScenariosResponse>({
    queryKey: ['revenue-scenarios', auditId, inputs],
    queryFn: () => getRevenueScenarios(auditId!, inputs),
    enabled: Boolean(auditId),
  });
}

export function useFunnelSimulation(
  auditId: string | undefined,
  inputs?: { monthlyVisitors?: number; conversionRate?: number }
) {
  return useQuery<FunnelSimulationResponse>({
    queryKey: ['funnel-simulation', auditId, inputs],
    queryFn: () => getFunnelSimulation(auditId!, inputs),
    enabled: Boolean(auditId),
  });
}

export function useWhatsAppOptimization(auditId: string | undefined) {
  return useQuery<WhatsAppOptimizationResponse>({
    queryKey: ['whatsapp-optimization', auditId],
    queryFn: () => getWhatsAppOptimization(auditId!),
    enabled: Boolean(auditId),
  });
}
