// Web build: no background tasks, nothing to watch.
export async function registerFlightWatch(): Promise<void> {}

export async function checkTrackedFlights(_now = new Date()): Promise<void> {}
