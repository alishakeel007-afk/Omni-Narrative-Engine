"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var story_database_1 = require("../lib/story-database");
var prisma_1 = require("../lib/prisma");
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var user, project, draftId, context, result, project2, draftId2, context2, context1, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("🚀 Starting Module 7.12 Character Identity Tests");
                    user = { id: "test-user-identity" };
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 16, 17, 19]);
                    // Clean up
                    return [4 /*yield*/, prisma_1.prisma.storyProject.deleteMany({ where: { userId: user.id } })];
                case 2:
                    // Clean up
                    _a.sent();
                    return [4 /*yield*/, (0, story_database_1.createStoryProjectWithInitialDraft)(user.id, {
                            title: "Identity Test Story",
                            mode: "guided",
                            draft: {
                                title: "Draft 1",
                                genres: ["Sci-Fi"],
                                tones: ["Tense"],
                                numberOfScenes: 3
                            }
                        })];
                case 3:
                    project = _a.sent();
                    draftId = project.drafts[0].id;
                    console.log("\u2705 Story Project created. Draft ID: ".concat(draftId));
                    // 3. Add initial character
                    return [4 /*yield*/, (0, story_database_1.addCharacterToDraft)(draftId, {
                            name: "Lyra",
                            role: "Protagonist",
                            personalityTone: "Calm",
                            traits: ["Smart", "Brave"],
                            appearancePrompt: "wearing standard silver armor"
                        })];
                case 4:
                    // 3. Add initial character
                    _a.sent();
                    console.log("✅ Character Lyra created");
                    return [4 /*yield*/, (0, story_database_1.getCharacterContextBlock)(draftId)];
                case 5:
                    context = _a.sent();
                    console.log("\nContext Block Before Scene 1:\n".concat(context));
                    if (context.includes("wearing standard silver armor") && !context.includes("Last known state")) {
                        console.log("✅ Context block has appearance, no emotion yet.");
                    }
                    else {
                        throw new Error("Context block failed to include visual appearance.");
                    }
                    // 5. Simulate Scene 1 completion (Lyra is calm)
                    return [4 /*yield*/, (0, story_database_1.upsertCharacterState)(draftId, "Lyra", {
                            emotionalState: "Calm",
                            sceneNumber: 1
                        })];
                case 6:
                    // 5. Simulate Scene 1 completion (Lyra is calm)
                    _a.sent();
                    console.log("✅ Scene 1 finished. Upserted Lyra state.");
                    return [4 /*yield*/, (0, story_database_1.getCharacterContextBlock)(draftId)];
                case 7:
                    // 6. Check context block again
                    context = _a.sent();
                    console.log("\nContext Block After Scene 1:\n".concat(context));
                    if (context.includes("Last known state: Calm") && context.includes("Last seen in Scene 1")) {
                        console.log("✅ Context block updated with emotional state and scene.");
                    }
                    else {
                        throw new Error("Context block failed to include emotion/scene.");
                    }
                    // 7. Simulate Scene 2 completion (Lyra is angry)
                    return [4 /*yield*/, (0, story_database_1.upsertCharacterState)(draftId, "Lyra", {
                            emotionalState: "Angry",
                            sceneNumber: 2
                        })];
                case 8:
                    // 7. Simulate Scene 2 completion (Lyra is angry)
                    _a.sent();
                    console.log("✅ Scene 2 finished. Upserted Lyra state.");
                    return [4 /*yield*/, (0, story_database_1.getCharacterContextBlock)(draftId)];
                case 9:
                    // 8. Check context block again
                    context = _a.sent();
                    console.log("\nContext Block After Scene 2:\n".concat(context));
                    if (context.includes("Last known state: Angry") && context.includes("Last seen in Scene 2")) {
                        console.log("✅ Context block updated with new emotional state and scene.");
                    }
                    else {
                        throw new Error("Context block failed to update emotion/scene.");
                    }
                    return [4 /*yield*/, (0, story_database_1.upsertCharacterState)(draftId, "Random Guard", {
                            emotionalState: "Afraid",
                            sceneNumber: 2
                        })];
                case 10:
                    result = _a.sent();
                    if (result === null) {
                        console.log("✅ Upsert character safely ignored unknown character.");
                    }
                    else {
                        throw new Error("Upsert character modified unknown character.");
                    }
                    return [4 /*yield*/, (0, story_database_1.createStoryProjectWithInitialDraft)(user.id, {
                            title: "Another Story",
                            mode: "guided",
                            draft: { title: "Draft 2", genres: [], tones: [], numberOfScenes: 1 }
                        })];
                case 11:
                    project2 = _a.sent();
                    draftId2 = project2.drafts[0].id;
                    return [4 /*yield*/, (0, story_database_1.addCharacterToDraft)(draftId2, {
                            name: "Lyra",
                            role: "Villain",
                            personalityTone: "Evil",
                            traits: ["Cruel"],
                        })];
                case 12:
                    _a.sent();
                    return [4 /*yield*/, (0, story_database_1.upsertCharacterState)(draftId2, "Lyra", { emotionalState: "Happy", sceneNumber: 1 })];
                case 13:
                    _a.sent();
                    return [4 /*yield*/, (0, story_database_1.getCharacterContextBlock)(draftId2)];
                case 14:
                    context2 = _a.sent();
                    return [4 /*yield*/, (0, story_database_1.getCharacterContextBlock)(draftId)];
                case 15:
                    context1 = _a.sent();
                    if (context2.includes("Evil") && context2.includes("Happy") && context1.includes("Angry")) {
                        console.log("✅ Draft isolation works correctly. Character data didn't leak.");
                    }
                    else {
                        throw new Error("Draft isolation failed.");
                    }
                    console.log("\n🎉 All Character Identity tests passed!");
                    return [3 /*break*/, 19];
                case 16:
                    error_1 = _a.sent();
                    console.error("❌ Test failed:", error_1);
                    return [3 /*break*/, 19];
                case 17: return [4 /*yield*/, prisma_1.prisma.storyProject.deleteMany({ where: { userId: user.id } })];
                case 18:
                    _a.sent();
                    return [7 /*endfinally*/];
                case 19: return [2 /*return*/];
            }
        });
    });
}
main();
