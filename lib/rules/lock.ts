/*
 * The one question the ballot pages ask about time: has the slate locked?
 * Request-scoped by nature — pages calling this are force-dynamic, so "now"
 * is the moment of the request, which is exactly the lock's meaning.
 */
export function slateIsLocked(locksAt: Date | null | undefined): boolean {
  return locksAt != null && locksAt.getTime() <= Date.now();
}
