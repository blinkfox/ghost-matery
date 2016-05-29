/* jslint esnext: true */

"use strict";
var src$core$$ = require("./core");

// hack to export the polyfill as global Intl if needed
if (!this.Intl) {
    this.Intl = src$core$$["default"];
    src$core$$["default"].__applyLocaleSensitivePrototypes();
}

exports["default"] = src$core$$["default"];

//# sourceMappingURL=main.js.map