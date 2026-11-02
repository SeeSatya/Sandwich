import { installNativeCopyCapture } from './nativeCopyCapture';

if (['chatgpt.com', 'chat.openai.com'].includes(location.hostname)) {
  installNativeCopyCapture(window);
} else {
  alert('Open a ChatGPT conversation, then enable this diagram copy helper there.');
}
