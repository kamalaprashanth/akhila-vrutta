// @ts-nocheck
// Vendored from hash-wasm 4.13.0 (MIT, Dani Biró), unchanged except import paths. See README.md.
class Mutex {
	private mutex = Promise.resolve();

	lock(): PromiseLike<() => void> {
		let begin: (unlock: () => void) => void = () => {};

		this.mutex = this.mutex.then(() => new Promise(begin));

		return new Promise((res) => {
			begin = res;
		});
	}

	async dispatch<T>(fn: () => PromiseLike<T>): Promise<T> {
		const unlock = await this.lock();
		try {
			return await Promise.resolve(fn());
		} finally {
			unlock();
		}
	}
}

export default Mutex;
