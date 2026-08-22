"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
/**
 * Phase 7 Tests — Custom Story Persistence
 *
 * Tests:
 * 1. Create project/draft via API (simulates handleBeginStory)
 * 2. Verify project is queryable (both guided + custom mode)
 * 3. Verify project is linked to correct user
 * 4. Verify DB project entry for custom story looks correct
 * 5. Save scenes into the draft (simulates Phase 5 auto-save)
 * 6. Load the custom story back (simulates Phase 6 Continue)
 * 7. Verify cross-user access denied on custom story
 */
var client_1 = require("@prisma/client");
var prisma = new client_1.PrismaClient();
// ─── Helpers ─────────────────────────────────────────────────────────────────
function createProjectViaPrisma(userId, title, mode, genres, tones, numberOfScenes) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, prisma.storyProject.create({
                    data: {
                        userId: userId,
                        title: title,
                        mode: mode,
                        drafts: {
                            create: {
                                title: title,
                                versionNumber: 1,
                                genres: genres,
                                tones: tones,
                                numberOfScenes: numberOfScenes,
                                isActive: true,
                            },
                        },
                    },
                    include: { drafts: true },
                })];
        });
    });
}
// ─── Test runner ─────────────────────────────────────────────────────────────
function runPhase7Tests() {
    return __awaiter(this, void 0, void 0, function () {
        var userId, otherUserId, guidedProject, guidedDraft, customProject, customDraft, i, savedScenes, firstScene, loadFullDraftState, loaded, firstLoadedScene, userProjects, modes, load2, crossResult, guidedScenes, customScenes, guidedDraftRow, customDraftRow;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("🚀 Phase 7 Custom Story Persistence Tests\n");
                    userId = "test-user-phase7-" + Date.now();
                    otherUserId = "other-user-phase7-" + Date.now();
                    // ── Test 1: Create guided story project ──────────────────────────────────────
                    console.log("--- Test 1: Create guided story project ---");
                    return [4 /*yield*/, createProjectViaPrisma(userId, "The Fallen Kingdom", client_1.StoryMode.GUIDED, ["Fantasy", "Adventure"], ["Dark", "Epic"], 10)];
                case 1:
                    guidedProject = _a.sent();
                    guidedDraft = guidedProject.drafts[0];
                    if (!guidedProject.id)
                        throw new Error("❌ Test 1 Failed: No project ID.");
                    if (!(guidedDraft === null || guidedDraft === void 0 ? void 0 : guidedDraft.id))
                        throw new Error("❌ Test 1 Failed: No draft ID.");
                    if (guidedProject.mode !== client_1.StoryMode.GUIDED)
                        throw new Error("❌ Test 1 Failed: Wrong mode.");
                    if (guidedProject.userId !== userId)
                        throw new Error("❌ Test 1 Failed: Wrong userId.");
                    console.log("   projectId: ".concat(guidedProject.id));
                    console.log("   draftId: ".concat(guidedDraft.id));
                    console.log("✅ Test 1 Passed. Guided story project created.");
                    // ── Test 2: Create custom story project ──────────────────────────────────────
                    console.log("\n--- Test 2: Create custom (AI Studio) story project ---");
                    return [4 /*yield*/, createProjectViaPrisma(userId, "My Dog Max", client_1.StoryMode.CUSTOM, ["Slice of Life"], ["Warm"], 5)];
                case 2:
                    customProject = _a.sent();
                    customDraft = customProject.drafts[0];
                    if (!customProject.id)
                        throw new Error("❌ Test 2 Failed: No project ID.");
                    if (customProject.mode !== client_1.StoryMode.CUSTOM)
                        throw new Error("❌ Test 2 Failed: Wrong mode.");
                    console.log("   projectId: ".concat(customProject.id));
                    console.log("   draftId: ".concat(customDraft.id));
                    console.log("✅ Test 2 Passed. Custom story project created.");
                    // ── Test 3: Save scenes (simulate Phase 5 auto-save) ─────────────────────────
                    console.log("\n--- Test 3: Save scenes to custom draft ---");
                    i = 1;
                    _a.label = 3;
                case 3:
                    if (!(i <= 5)) return [3 /*break*/, 6];
                    return [4 /*yield*/, prisma.scene.upsert({
                            where: { draftId_sceneNumber: { draftId: customDraft.id, sceneNumber: i } },
                            create: {
                                draftId: customDraft.id,
                                sceneNumber: i,
                                title: "Scene ".concat(i, ": ").concat(i === 1 ? "My dog Max appeared" : "The adventure continues"),
                                description: i === 1
                                    ? "The player meets Max, a golden retriever. 'My character's dog is named Max,' the narrator says."
                                    : "Scene ".concat(i, " narrative text."),
                                location: "Home",
                                mood: "Warm",
                                choices: {
                                    create: [{
                                            choiceText: "Choice at scene ".concat(i),
                                            choiceType: "AI_SUGGESTED",
                                            selected: true,
                                            resultText: "Result of choice ".concat(i),
                                        }],
                                },
                            },
                            update: { description: "Scene ".concat(i, " narrative text.") },
                        })];
                case 4:
                    _a.sent();
                    _a.label = 5;
                case 5:
                    i++;
                    return [3 /*break*/, 3];
                case 6: return [4 /*yield*/, prisma.storyDraft.update({
                        where: { id: customDraft.id },
                        data: {
                            progressState: {
                                sceneIndex: 5,
                                health: 90,
                                mana: 80,
                                resolve: 85,
                                inventory: ["Leash", "Ball"],
                            },
                        },
                    })];
                case 7:
                    _a.sent();
                    return [4 /*yield*/, prisma.scene.findMany({
                            where: { draftId: customDraft.id },
                            orderBy: { sceneNumber: "asc" },
                        })];
                case 8:
                    savedScenes = _a.sent();
                    if (savedScenes.length !== 5)
                        throw new Error("\u274C Test 3 Failed: Expected 5 scenes, got ".concat(savedScenes.length, "."));
                    firstScene = savedScenes[0];
                    if (!firstScene.description.includes("Max"))
                        throw new Error("❌ Test 3 Failed: Max not in scene 1.");
                    console.log("   Saved ".concat(savedScenes.length, " scenes. Scene 1: \"").concat(firstScene.title, "\""));
                    console.log("✅ Test 3 Passed. Scenes saved with correct content.");
                    // ── Test 4: Load custom story (simulate Phase 6 Continue) ────────────────────
                    console.log("\n--- Test 4: Load custom story from DB ---");
                    return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require("../lib/story-database.ts")); })];
                case 9:
                    loadFullDraftState = (_a.sent()).loadFullDraftState;
                    return [4 /*yield*/, loadFullDraftState(customProject.id, userId)];
                case 10:
                    loaded = _a.sent();
                    if (!loaded)
                        throw new Error("❌ Test 4 Failed: loadFullDraftState returned null.");
                    if (loaded.scenes.length !== 5)
                        throw new Error("\u274C Test 4 Failed: Expected 5 scenes, got ".concat(loaded.scenes.length, "."));
                    if (!loaded.progressState)
                        throw new Error("❌ Test 4 Failed: No progressState.");
                    if (loaded.progressState.inventory.join(",") !== "Leash,Ball") {
                        throw new Error("\u274C Test 4 Failed: Wrong inventory [".concat(loaded.progressState.inventory, "]"));
                    }
                    firstLoadedScene = loaded.scenes[0];
                    if (!firstLoadedScene.description.includes("Max"))
                        throw new Error("❌ Test 4 Failed: Max not in restored scene 1.");
                    console.log("   Scenes: ".concat(loaded.scenes.map(function (s) { return s.sceneNumber; }).join(",")));
                    console.log("   Inventory: [".concat(loaded.progressState.inventory, "]"));
                    console.log("   Scene 1 text contains 'Max': \u2705");
                    console.log("✅ Test 4 Passed. Custom story restored correctly from DB.");
                    // ── Test 5: Both story types appear in projects list ─────────────────────────
                    console.log("\n--- Test 5: Both story types in projects list ---");
                    return [4 /*yield*/, prisma.storyProject.findMany({
                            where: { userId: userId },
                            include: { drafts: { take: 1 } },
                        })];
                case 11:
                    userProjects = _a.sent();
                    if (userProjects.length !== 2)
                        throw new Error("\u274C Test 5 Failed: Expected 2 projects, got ".concat(userProjects.length, "."));
                    modes = userProjects.map(function (p) { return p.mode; }).sort();
                    if (JSON.stringify(modes) !== JSON.stringify(["CUSTOM", "GUIDED"])) {
                        throw new Error("\u274C Test 5 Failed: Wrong modes: ".concat(JSON.stringify(modes)));
                    }
                    console.log("   Projects: ".concat(userProjects.map(function (p) { return "".concat(p.title, " (").concat(p.mode, ")"); }).join(", ")));
                    console.log("✅ Test 5 Passed. Both guided and custom stories are in the same projects list.");
                    // ── Test 6: Cross-user access denied ─────────────────────────────────────────
                    console.log("\n--- Test 6: Cross-user access control ---");
                    return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require("../lib/story-database.ts")); })];
                case 12:
                    load2 = (_a.sent()).loadFullDraftState;
                    return [4 /*yield*/, load2(customProject.id, otherUserId)];
                case 13:
                    crossResult = _a.sent();
                    if (crossResult !== null)
                        throw new Error("❌ Test 6 Failed: Cross-user access was allowed!");
                    console.log("✅ Test 6 Passed. Other user cannot access custom story.");
                    // ── Test 7: Single unified pipeline check ─────────────────────────────────────
                    console.log("\n--- Test 7: Unified pipeline — both stories use same schema ---");
                    return [4 /*yield*/, prisma.scene.findMany({ where: { draftId: guidedDraft.id } })];
                case 14:
                    guidedScenes = _a.sent();
                    return [4 /*yield*/, prisma.scene.findMany({ where: { draftId: customDraft.id } })];
                case 15:
                    customScenes = _a.sent();
                    return [4 /*yield*/, prisma.storyDraft.findUnique({ where: { id: guidedDraft.id } })];
                case 16:
                    guidedDraftRow = _a.sent();
                    return [4 /*yield*/, prisma.storyDraft.findUnique({ where: { id: customDraft.id } })];
                case 17:
                    customDraftRow = _a.sent();
                    if (!guidedDraftRow || !customDraftRow)
                        throw new Error("❌ Test 7 Failed: Draft rows missing.");
                    console.log("   Guided draft: versionNumber=".concat(guidedDraftRow.versionNumber, ", isActive=").concat(guidedDraftRow.isActive));
                    console.log("   Custom draft: versionNumber=".concat(customDraftRow.versionNumber, ", isActive=").concat(customDraftRow.isActive));
                    console.log("✅ Test 7 Passed. Both story types share the same DB pipeline.");
                    // ── Cleanup ───────────────────────────────────────────────────────────────────
                    console.log("\nCleaning up...");
                    return [4 /*yield*/, prisma.storyProject.deleteMany({ where: { userId: { in: [userId, otherUserId] } } })];
                case 18:
                    _a.sent();
                    console.log("✅ Cleanup complete.");
                    console.log("\n🎉 All Phase 7 tests passed!");
                    return [2 /*return*/];
            }
        });
    });
}
runPhase7Tests()
    .catch(console.error)
    .finally(function () { return prisma.$disconnect(); });
