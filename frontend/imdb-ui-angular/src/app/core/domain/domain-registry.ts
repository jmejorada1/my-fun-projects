import { DomainConfig } from './domain-config.model';
import { IMDB_BIGOTRY_CONFIG } from './configs/imdb-bigotry.config';
import { IMDB_STANDARD_CONFIG } from './configs/imdb-standard.config';

/** Adding a domain: write its config and list it here (docs/architecture.md §4). */
export const DOMAIN_REGISTRY: readonly DomainConfig[] = [IMDB_BIGOTRY_CONFIG, IMDB_STANDARD_CONFIG];
