/**
 * Безопасное копирование текста в буфер обмена
 * Работает даже без HTTPS (fallback через execCommand)
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    // Пробуем современный API
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Clipboard API недоступен — используем fallback
  }

  // Fallback через textarea + execCommand
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  } catch {
    return false;
  }
}
