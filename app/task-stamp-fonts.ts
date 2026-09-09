let loading: Promise<void> | undefined;

// Shared across task-board mounts. Start on room entry, before any stamp exists.
export function loadTaskStampFonts(): Promise<void> {
  if (!loading) {
    loading = Promise.all([
      document.fonts.load('400 36px "TaskStampLatin"'),
      document.fonts.load('400 36px "TaskStampChinese"'),
    ]).then(faces => {
      if (faces.some(list => list.length === 0)) throw new Error("Stamp font is unavailable");
    }).catch(error => {
      loading = undefined;
      throw error;
    });
  }
  return loading;
}
