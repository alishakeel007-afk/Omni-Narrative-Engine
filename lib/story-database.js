"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.createStoryProjectWithInitialDraft = createStoryProjectWithInitialDraft;
exports.createDraftVersion = createDraftVersion;
exports.addCharacterToDraft = addCharacterToDraft;
exports.getCharactersForDraft = getCharactersForDraft;
exports.upsertCharacterState = upsertCharacterState;
exports.getCharacterContextBlock = getCharacterContextBlock;
exports.addSceneToDraft = addSceneToDraft;
exports.recordStoryMemory = recordStoryMemory;
exports.recordMediaAsset = recordMediaAsset;
exports.createVideoGenerationJob = createVideoGenerationJob;
exports.updateVideoGenerationJob = updateVideoGenerationJob;
exports.loadFullDraftState = loadFullDraftState;
var client_1 = require("@prisma/client");
var prisma_1 = require("@/lib/prisma");
function createStoryProjectWithInitialDraft(userId, input) {
    var _a;
    return prisma_1.prisma.storyProject.create({
        data: {
            userId: userId,
            title: input.title,
            mode: input.mode,
            drafts: {
                create: {
                    title: input.draft.title,
                    versionNumber: 1,
                    genres: input.draft.genres,
                    tones: input.draft.tones,
                    numberOfScenes: input.draft.numberOfScenes,
                    includeNarration: (_a = input.draft.includeNarration) !== null && _a !== void 0 ? _a : true,
                    isActive: true,
                },
            },
        },
        include: {
            drafts: true,
        },
    });
}
function createDraftVersion(storyProjectId, baseDraftId) {
    return __awaiter(this, void 0, void 0, function () {
        var latestDraft, baseDraft, _a;
        var _this = this;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, prisma_1.prisma.storyDraft.findFirst({
                        where: { storyProjectId: storyProjectId },
                        orderBy: { versionNumber: "desc" },
                    })];
                case 1:
                    latestDraft = _b.sent();
                    if (!baseDraftId) return [3 /*break*/, 3];
                    return [4 /*yield*/, prisma_1.prisma.storyDraft.findUnique({ where: { id: baseDraftId } })];
                case 2:
                    _a = _b.sent();
                    return [3 /*break*/, 4];
                case 3:
                    _a = latestDraft;
                    _b.label = 4;
                case 4:
                    baseDraft = _a;
                    if (!baseDraft) {
                        throw new Error("Cannot create a new draft version without an existing draft.");
                    }
                    return [2 /*return*/, prisma_1.prisma.$transaction(function (tx) { return __awaiter(_this, void 0, void 0, function () {
                            var _a;
                            return __generator(this, function (_b) {
                                switch (_b.label) {
                                    case 0: return [4 /*yield*/, tx.storyDraft.updateMany({
                                            where: { storyProjectId: storyProjectId },
                                            data: { isActive: false },
                                        })];
                                    case 1:
                                        _b.sent();
                                        return [2 /*return*/, tx.storyDraft.create({
                                                data: {
                                                    storyProjectId: storyProjectId,
                                                    versionNumber: ((_a = latestDraft === null || latestDraft === void 0 ? void 0 : latestDraft.versionNumber) !== null && _a !== void 0 ? _a : 0) + 1,
                                                    title: baseDraft.title,
                                                    genres: baseDraft.genres,
                                                    tones: baseDraft.tones,
                                                    numberOfScenes: baseDraft.numberOfScenes,
                                                    includeNarration: baseDraft.includeNarration,
                                                    isActive: true,
                                                },
                                            })];
                                }
                            });
                        }); })];
            }
        });
    });
}
function addCharacterToDraft(draftId, input) {
    var _a;
    return prisma_1.prisma.character.create({
        data: {
            draftId: draftId,
            name: input.name,
            role: input.role,
            personalityTone: input.personalityTone,
            traits: input.traits,
            voiceStyle: input.voiceStyle,
            appearancePrompt: input.appearancePrompt,
            referenceImageUrl: input.referenceImageUrl,
            voiceSampleUrl: input.voiceSampleUrl,
            sourceType: (_a = input.sourceType) !== null && _a !== void 0 ? _a : client_1.CharacterSource.TEXT,
        },
    });
}
/**
 * Fetch all characters for a draft with full identity fields.
 */
function getCharactersForDraft(draftId) {
    return prisma_1.prisma.character.findMany({
        where: { draftId: draftId },
        select: {
            id: true,
            name: true,
            role: true,
            personalityTone: true,
            traits: true,
            voiceStyle: true,
            appearancePrompt: true,
            referenceImageUrl: true,
            voiceSampleUrl: true,
            sourceType: true,
            lastSeenScene: true,
            currentEmotionalState: true,
        },
        orderBy: { createdAt: "asc" },
    });
}
/**
 * Update a character's runtime identity state after a scene is generated.
 * Matches by draftId + name (case-insensitive). Silently skips unknown characters.
 */
function upsertCharacterState(draftId, characterName, update) {
    return __awaiter(this, void 0, void 0, function () {
        var existing;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, prisma_1.prisma.character.findFirst({
                        where: {
                            draftId: draftId,
                            name: { equals: characterName, mode: "insensitive" },
                        },
                        select: { id: true },
                    })];
                case 1:
                    existing = _a.sent();
                    if (!existing)
                        return [2 /*return*/, null]; // Character not in DB (e.g. one-off NPC) — skip silently
                    return [2 /*return*/, prisma_1.prisma.character.update({
                            where: { id: existing.id },
                            data: __assign(__assign(__assign({}, (update.emotionalState ? { currentEmotionalState: update.emotionalState } : {})), (update.visualAppearance ? { appearancePrompt: update.visualAppearance } : {})), (update.sceneNumber !== undefined ? { lastSeenScene: update.sceneNumber } : {})),
                        })];
            }
        });
    });
}
/**
 * Build a formatted character context block for LLM prompt injection.
 * Includes known visual appearance and last emotional state.
 */
function getCharacterContextBlock(draftId) {
    return __awaiter(this, void 0, void 0, function () {
        var characters, lines;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getCharactersForDraft(draftId)];
                case 1:
                    characters = _a.sent();
                    if (!characters.length)
                        return [2 /*return*/, ""];
                    lines = characters.map(function (c) {
                        var traits = Array.isArray(c.traits) ? c.traits.join(", ") : "";
                        var appearance = c.appearancePrompt ? "Visual: ".concat(c.appearancePrompt, ".") : "";
                        var emotion = c.currentEmotionalState ? "Last known state: ".concat(c.currentEmotionalState, ".") : "";
                        var lastSeen = c.lastSeenScene ? "Last seen in Scene ".concat(c.lastSeenScene, ".") : "";
                        return "- ".concat(c.name, " (").concat(c.role, "): Personality: ").concat(c.personalityTone, ". Traits: ").concat(traits, ". ").concat(appearance, " ").concat(emotion, " ").concat(lastSeen).trim();
                    });
                    return [2 /*return*/, "Established Characters (maintain strict consistency for these):\n".concat(lines.join("\n"))];
            }
        });
    });
}
function addSceneToDraft(draftId, input) {
    var _a, _b;
    return prisma_1.prisma.scene.create({
        data: {
            draftId: draftId,
            sceneNumber: input.sceneNumber,
            title: input.title,
            description: input.description,
            location: input.location,
            mood: input.mood,
            selectedSuggestion: input.selectedSuggestion,
            choices: ((_a = input.choices) === null || _a === void 0 ? void 0 : _a.length)
                ? {
                    create: input.choices.map(function (choice) {
                        var _a, _b;
                        return ({
                            choiceText: choice.choiceText,
                            choiceType: (_a = choice.choiceType) !== null && _a !== void 0 ? _a : client_1.ChoiceType.AI_SUGGESTED,
                            selected: (_b = choice.selected) !== null && _b !== void 0 ? _b : false,
                            resultText: choice.resultText,
                        });
                    }),
                }
                : undefined,
            dialogues: ((_b = input.dialogues) === null || _b === void 0 ? void 0 : _b.length)
                ? {
                    create: input.dialogues.map(function (dialogue) { return ({
                        characterId: dialogue.characterId,
                        text: dialogue.text,
                        delivery: dialogue.delivery,
                        audioUrl: dialogue.audioUrl,
                    }); }),
                }
                : undefined,
        },
        include: {
            choices: true,
            dialogues: true,
        },
    });
}
function recordStoryMemory(params) {
    var _a;
    return prisma_1.prisma.storyMemory.create({
        data: {
            draftId: params.draftId,
            sceneId: params.sceneId,
            memoryType: params.memoryType,
            content: params.content,
            importanceScore: (_a = params.importanceScore) !== null && _a !== void 0 ? _a : 1,
        },
    });
}
function recordMediaAsset(params) {
    var _a;
    return prisma_1.prisma.mediaAsset.create({
        data: {
            draftId: params.draftId,
            sceneId: params.sceneId,
            characterId: params.characterId,
            type: params.type,
            url: params.url,
            storagePath: params.storagePath,
            prompt: params.prompt,
            provider: params.provider,
            status: (_a = params.status) !== null && _a !== void 0 ? _a : client_1.MediaStatus.PENDING,
        },
    });
}
function createVideoGenerationJob(draftId) {
    return prisma_1.prisma.videoGenerationJob.create({
        data: {
            draftId: draftId,
            status: client_1.JobStatus.PENDING,
        },
    });
}
function updateVideoGenerationJob(id, data) {
    return prisma_1.prisma.videoGenerationJob.update({
        where: { id: id },
        data: data,
    });
}
/**
 * Assembles the complete, restorable story state for a given draft.
 * Keeps API routes thin by centralizing all query logic here.
 */
function loadFullDraftState(projectId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var project, draft, progressRaw, progressState;
        var _a, _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0: return [4 /*yield*/, prisma_1.prisma.storyProject.findFirst({
                        where: { id: projectId, userId: userId },
                        select: {
                            id: true,
                            drafts: {
                                where: { isActive: true },
                                orderBy: { versionNumber: "desc" },
                                take: 1,
                                select: {
                                    id: true,
                                    title: true,
                                    genres: true,
                                    tones: true,
                                    numberOfScenes: true,
                                    progressState: true,
                                    characters: {
                                        select: {
                                            id: true,
                                            name: true,
                                            role: true,
                                            personalityTone: true,
                                            traits: true,
                                            voiceStyle: true,
                                        },
                                    },
                                    scenes: {
                                        orderBy: { sceneNumber: "asc" },
                                        select: {
                                            id: true,
                                            sceneNumber: true,
                                            title: true,
                                            description: true,
                                            location: true,
                                            mood: true,
                                            choices: {
                                                select: {
                                                    id: true,
                                                    choiceText: true,
                                                    choiceType: true,
                                                    selected: true,
                                                    resultText: true,
                                                },
                                            },
                                        },
                                    },
                                    memories: {
                                        orderBy: { createdAt: "asc" },
                                        select: {
                                            id: true,
                                            memoryType: true,
                                            content: true,
                                            importanceScore: true,
                                        },
                                    },
                                },
                            },
                        },
                    })];
                case 1:
                    project = _e.sent();
                    if (!project || project.drafts.length === 0)
                        return [2 /*return*/, null];
                    draft = project.drafts[0];
                    progressRaw = draft.progressState;
                    progressState = progressRaw
                        ? {
                            sceneIndex: Number((_a = progressRaw.sceneIndex) !== null && _a !== void 0 ? _a : 0),
                            health: Number((_b = progressRaw.health) !== null && _b !== void 0 ? _b : 100),
                            mana: Number((_c = progressRaw.mana) !== null && _c !== void 0 ? _c : 100),
                            resolve: Number((_d = progressRaw.resolve) !== null && _d !== void 0 ? _d : 100),
                            inventory: Array.isArray(progressRaw.inventory) ? progressRaw.inventory : [],
                        }
                        : null;
                    return [2 /*return*/, {
                            projectId: project.id,
                            draftId: draft.id,
                            title: draft.title,
                            genres: Array.isArray(draft.genres) ? draft.genres : [],
                            tones: Array.isArray(draft.tones) ? draft.tones : [],
                            numberOfScenes: draft.numberOfScenes,
                            progressState: progressState,
                            scenes: draft.scenes.map(function (s) { return ({
                                id: s.id,
                                sceneNumber: s.sceneNumber,
                                title: s.title,
                                description: s.description,
                                location: s.location,
                                mood: s.mood,
                                choices: s.choices.map(function (c) { return ({
                                    id: c.id,
                                    choiceText: c.choiceText,
                                    choiceType: c.choiceType,
                                    selected: c.selected,
                                    resultText: c.resultText,
                                }); }),
                            }); }),
                            characters: draft.characters.map(function (c) { return ({
                                id: c.id,
                                name: c.name,
                                role: c.role,
                                personalityTone: c.personalityTone,
                                traits: Array.isArray(c.traits) ? c.traits : [],
                                voiceStyle: c.voiceStyle,
                            }); }),
                            memories: draft.memories.map(function (m) { return ({
                                id: m.id,
                                memoryType: m.memoryType,
                                content: m.content,
                                importanceScore: m.importanceScore,
                            }); }),
                        }];
            }
        });
    });
}
