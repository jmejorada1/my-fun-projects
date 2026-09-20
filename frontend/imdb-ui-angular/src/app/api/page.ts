/** Shape of a Spring Data `Page<T>` JSON response. */
export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}
