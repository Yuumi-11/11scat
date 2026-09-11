export function withLoadingTimeout<T>(request: Promise<T>, ms = 90_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('教室加载超时，请检查网络后重试。')), ms);
    request.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}
