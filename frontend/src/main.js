import { createApp } from "vue";
import App from "./App.vue";
import router from "./router/index.js";
import "./api/index.js"; // configure axios defaults

createApp(App).use(router).mount("#app");
