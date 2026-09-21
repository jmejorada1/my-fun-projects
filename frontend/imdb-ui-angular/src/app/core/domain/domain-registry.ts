import { DomainConfig } from './domain-config.model';
import { IMDB_BIGOTRY_CONFIG } from './configs/imdb-bigotry.config';
import { IMDB_STANDARD_CONFIG } from './configs/imdb-standard.config';

/**
 * Every domain's config — the single source of truth DOMAIN_OPTIONS
 * (domain-options.ts) is derived from. Add a new domain by writing its
 * config file and adding it here — nothing else needs a manual edit
 * (docs/domain-configurability-plan.md §5–§6). `imdb/standard` is listed
 * but `enabled: false` in its own config until Phase 2b seeds real backend
 * data for it.
 */
export const DOMAIN_REGISTRY: readonly DomainConfig[] = [IMDB_BIGOTRY_CONFIG, IMDB_STANDARD_CONFIG];
