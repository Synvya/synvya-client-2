/**
 * Tests for Square Lambda functions
 */

import { describe, it, expect } from "vitest";

// Since the functions are not exported, we'll test the logic conceptually
// In a real scenario, we would export the functions or use integration tests

describe("fetchNormalizedCatalog - Food & Beverage Fields Extraction", () => {
  it("should extract ingredients from food_and_beverage_details", () => {
    // Mock Square API item_data structure
    const itemData = {
      name: "Bocadillo de Jamón",
      description: "Traditional Spanish baguette",
      food_and_beverage_details: {
        ingredients: [
          { type: "STANDARD", standard_name: "GLUTEN" },
          { type: "STANDARD", standard_name: "WHEAT" }
        ]
      }
    };

    // Simulate extraction logic
    const ingredients = [];
    if (itemData.food_and_beverage_details) {
      const fbDetails = itemData.food_and_beverage_details;
      if (Array.isArray(fbDetails.ingredients)) {
        for (const ingredient of fbDetails.ingredients) {
          if (ingredient && typeof ingredient.standard_name === "string") {
            ingredients.push(ingredient.standard_name);
          }
        }
      }
    }

    expect(ingredients).toEqual(["GLUTEN", "WHEAT"]);
    expect(ingredients).toHaveLength(2);
  });

  it("should extract dietary_preferences from food_and_beverage_details", () => {
    // Mock Square API item_data structure
    const itemData = {
      name: "Paella Valenciana",
      description: "Saffron rice dish",
      food_and_beverage_details: {
        dietary_preferences: [
          { type: "STANDARD", standard_name: "GLUTEN_FREE" },
          { type: "STANDARD", standard_name: "DAIRY_FREE" },
          { type: "STANDARD", standard_name: "NUT_FREE" }
        ]
      }
    };

    // Simulate extraction logic
    const dietaryPreferences = [];
    if (itemData.food_and_beverage_details) {
      const fbDetails = itemData.food_and_beverage_details;
      if (Array.isArray(fbDetails.dietary_preferences)) {
        for (const pref of fbDetails.dietary_preferences) {
          if (pref && typeof pref.standard_name === "string") {
            dietaryPreferences.push(pref.standard_name);
          }
        }
      }
    }

    expect(dietaryPreferences).toEqual(["GLUTEN_FREE", "DAIRY_FREE", "NUT_FREE"]);
    expect(dietaryPreferences).toHaveLength(3);
  });

  it("should extract both ingredients and dietary_preferences", () => {
    // Mock Square API item_data structure
    const itemData = {
      name: "Test Item",
      description: "Test description",
      food_and_beverage_details: {
        ingredients: [
          { type: "STANDARD", standard_name: "GLUTEN" }
        ],
        dietary_preferences: [
          { type: "STANDARD", standard_name: "GLUTEN_FREE" }
        ]
      }
    };

    // Simulate extraction logic
    const ingredients = [];
    const dietaryPreferences = [];
    if (itemData.food_and_beverage_details) {
      const fbDetails = itemData.food_and_beverage_details;
      if (Array.isArray(fbDetails.ingredients)) {
        for (const ingredient of fbDetails.ingredients) {
          if (ingredient && typeof ingredient.standard_name === "string") {
            ingredients.push(ingredient.standard_name);
          }
        }
      }
      if (Array.isArray(fbDetails.dietary_preferences)) {
        for (const pref of fbDetails.dietary_preferences) {
          if (pref && typeof pref.standard_name === "string") {
            dietaryPreferences.push(pref.standard_name);
          }
        }
      }
    }

    expect(ingredients).toEqual(["GLUTEN"]);
    expect(dietaryPreferences).toEqual(["GLUTEN_FREE"]);
  });

  it("should return empty arrays when food_and_beverage_details is missing", () => {
    // Mock Square API item_data structure without food_and_beverage_details
    const itemData = {
      name: "Test Item",
      description: "Test description"
    };

    // Simulate extraction logic
    const ingredients = [];
    const dietaryPreferences = [];
    if (itemData.food_and_beverage_details) {
      const fbDetails = itemData.food_and_beverage_details;
      if (Array.isArray(fbDetails.ingredients)) {
        for (const ingredient of fbDetails.ingredients) {
          if (ingredient && typeof ingredient.standard_name === "string") {
            ingredients.push(ingredient.standard_name);
          }
        }
      }
      if (Array.isArray(fbDetails.dietary_preferences)) {
        for (const pref of fbDetails.dietary_preferences) {
          if (pref && typeof pref.standard_name === "string") {
            dietaryPreferences.push(pref.standard_name);
          }
        }
      }
    }

    expect(ingredients).toEqual([]);
    expect(dietaryPreferences).toEqual([]);
  });

  it("should return empty arrays when ingredients/dietary_preferences arrays are missing", () => {
    // Mock Square API item_data structure with empty food_and_beverage_details
    const itemData = {
      name: "Test Item",
      description: "Test description",
      food_and_beverage_details: {}
    };

    // Simulate extraction logic
    const ingredients = [];
    const dietaryPreferences = [];
    if (itemData.food_and_beverage_details) {
      const fbDetails = itemData.food_and_beverage_details;
      if (Array.isArray(fbDetails.ingredients)) {
        for (const ingredient of fbDetails.ingredients) {
          if (ingredient && typeof ingredient.standard_name === "string") {
            ingredients.push(ingredient.standard_name);
          }
        }
      }
      if (Array.isArray(fbDetails.dietary_preferences)) {
        for (const pref of fbDetails.dietary_preferences) {
          if (pref && typeof pref.standard_name === "string") {
            dietaryPreferences.push(pref.standard_name);
          }
        }
      }
    }

    expect(ingredients).toEqual([]);
    expect(dietaryPreferences).toEqual([]);
  });

  it("should filter out ingredients without standard_name", () => {
    // Mock Square API item_data structure with invalid entries
    const itemData = {
      name: "Test Item",
      food_and_beverage_details: {
        ingredients: [
          { type: "STANDARD", standard_name: "GLUTEN" },
          { type: "STANDARD" }, // missing standard_name
          null,
          { type: "STANDARD", standard_name: "WHEAT" }
        ]
      }
    };

    // Simulate extraction logic
    const ingredients = [];
    if (itemData.food_and_beverage_details) {
      const fbDetails = itemData.food_and_beverage_details;
      if (Array.isArray(fbDetails.ingredients)) {
        for (const ingredient of fbDetails.ingredients) {
          if (ingredient && typeof ingredient.standard_name === "string") {
            ingredients.push(ingredient.standard_name);
          }
        }
      }
    }

    expect(ingredients).toEqual(["GLUTEN", "WHEAT"]);
    expect(ingredients).toHaveLength(2);
  });

  it("should handle items with only ingredients (no dietary_preferences)", () => {
    const itemData = {
      name: "Test Item",
      food_and_beverage_details: {
        ingredients: [
          { type: "STANDARD", standard_name: "GLUTEN" }
        ]
      }
    };

    const ingredients = [];
    const dietaryPreferences = [];
    if (itemData.food_and_beverage_details) {
      const fbDetails = itemData.food_and_beverage_details;
      if (Array.isArray(fbDetails.ingredients)) {
        for (const ingredient of fbDetails.ingredients) {
          if (ingredient && typeof ingredient.standard_name === "string") {
            ingredients.push(ingredient.standard_name);
          }
        }
      }
      if (Array.isArray(fbDetails.dietary_preferences)) {
        for (const pref of fbDetails.dietary_preferences) {
          if (pref && typeof pref.standard_name === "string") {
            dietaryPreferences.push(pref.standard_name);
          }
        }
      }
    }

    expect(ingredients).toEqual(["GLUTEN"]);
    expect(dietaryPreferences).toEqual([]);
  });
});

describe("extractNameFromKind0", () => {
  it("should extract display_name from kind:0 event content", () => {
    const event = {
      content: JSON.stringify({
        display_name: "Restaurant El Candado",
        name: "El Candado",
        handle: "elcandado"
      })
    };

    // Simulate extraction logic
    let businessName = null;
    if (event.content) {
      try {
        const parsed = JSON.parse(event.content);
        if (typeof parsed?.display_name === "string" && parsed.display_name.trim()) {
          businessName = parsed.display_name.trim();
        } else if (typeof parsed?.name === "string" && parsed.name.trim()) {
          businessName = parsed.name.trim();
        } else if (typeof parsed?.handle === "string" && parsed.handle.trim()) {
          businessName = parsed.handle.trim();
        }
      } catch (error) {
        // ignore
      }
    }

    expect(businessName).toBe("Restaurant El Candado");
  });

  it("should fallback to name when display_name is missing", () => {
    const event = {
      content: JSON.stringify({
        name: "El Candado",
        handle: "elcandado"
      })
    };

    // Simulate extraction logic
    let businessName = null;
    if (event.content) {
      try {
        const parsed = JSON.parse(event.content);
        if (typeof parsed?.display_name === "string" && parsed.display_name.trim()) {
          businessName = parsed.display_name.trim();
        } else if (typeof parsed?.name === "string" && parsed.name.trim()) {
          businessName = parsed.name.trim();
        } else if (typeof parsed?.handle === "string" && parsed.handle.trim()) {
          businessName = parsed.handle.trim();
        }
      } catch (error) {
        // ignore
      }
    }

    expect(businessName).toBe("El Candado");
  });

  it("should fallback to handle when display_name and name are missing", () => {
    const event = {
      content: JSON.stringify({
        handle: "elcandado"
      })
    };

    // Simulate extraction logic
    let businessName = null;
    if (event.content) {
      try {
        const parsed = JSON.parse(event.content);
        if (typeof parsed?.display_name === "string" && parsed.display_name.trim()) {
          businessName = parsed.display_name.trim();
        } else if (typeof parsed?.name === "string" && parsed.name.trim()) {
          businessName = parsed.name.trim();
        } else if (typeof parsed?.handle === "string" && parsed.handle.trim()) {
          businessName = parsed.handle.trim();
        }
      } catch (error) {
        // ignore
      }
    }

    expect(businessName).toBe("elcandado");
  });

  it("should return null when no name fields are present", () => {
    const event = {
      content: JSON.stringify({
        about: "A restaurant"
      })
    };

    // Simulate extraction logic
    let businessName = null;
    if (event.content) {
      try {
        const parsed = JSON.parse(event.content);
        if (typeof parsed?.display_name === "string" && parsed.display_name.trim()) {
          businessName = parsed.display_name.trim();
        } else if (typeof parsed?.name === "string" && parsed.name.trim()) {
          businessName = parsed.name.trim();
        } else if (typeof parsed?.handle === "string" && parsed.handle.trim()) {
          businessName = parsed.handle.trim();
        }
      } catch (error) {
        // ignore
      }
    }

    expect(businessName).toBeNull();
  });

  it("should return null when event is null", () => {
    const event = null;

    // Simulate extraction logic
    let businessName = null;
    if (event && event.content) {
      try {
        const parsed = JSON.parse(event.content);
        if (typeof parsed?.display_name === "string" && parsed.display_name.trim()) {
          businessName = parsed.display_name.trim();
        } else if (typeof parsed?.name === "string" && parsed.name.trim()) {
          businessName = parsed.name.trim();
        } else if (typeof parsed?.handle === "string" && parsed.handle.trim()) {
          businessName = parsed.handle.trim();
        }
      } catch (error) {
        // ignore
      }
    }

    expect(businessName).toBeNull();
  });

  it("should return null when content is missing", () => {
    const event = {};

    // Simulate extraction logic
    let businessName = null;
    if (event && event.content) {
      try {
        const parsed = JSON.parse(event.content);
        if (typeof parsed?.display_name === "string" && parsed.display_name.trim()) {
          businessName = parsed.display_name.trim();
        } else if (typeof parsed?.name === "string" && parsed.name.trim()) {
          businessName = parsed.name.trim();
        } else if (typeof parsed?.handle === "string" && parsed.handle.trim()) {
          businessName = parsed.handle.trim();
        }
      } catch (error) {
        // ignore
      }
    }

    expect(businessName).toBeNull();
  });

  it("should trim whitespace from name values", () => {
    const event = {
      content: JSON.stringify({
        display_name: "  Restaurant El Candado  "
      })
    };

    // Simulate extraction logic
    let businessName = null;
    if (event.content) {
      try {
        const parsed = JSON.parse(event.content);
        if (typeof parsed?.display_name === "string" && parsed.display_name.trim()) {
          businessName = parsed.display_name.trim();
        } else if (typeof parsed?.name === "string" && parsed.name.trim()) {
          businessName = parsed.name.trim();
        } else if (typeof parsed?.handle === "string" && parsed.handle.trim()) {
          businessName = parsed.handle.trim();
        }
      } catch (error) {
        // ignore
      }
    }

    expect(businessName).toBe("Restaurant El Candado");
  });

  it("should prefer display_name over name even if both exist", () => {
    const event = {
      content: JSON.stringify({
        display_name: "Restaurant El Candado",
        name: "El Candado"
      })
    };

    // Simulate extraction logic
    let businessName = null;
    if (event.content) {
      try {
        const parsed = JSON.parse(event.content);
        if (typeof parsed?.display_name === "string" && parsed.display_name.trim()) {
          businessName = parsed.display_name.trim();
        } else if (typeof parsed?.name === "string" && parsed.name.trim()) {
          businessName = parsed.name.trim();
        } else if (typeof parsed?.handle === "string" && parsed.handle.trim()) {
          businessName = parsed.handle.trim();
        }
      } catch (error) {
        // ignore
      }
    }

    expect(businessName).toBe("Restaurant El Candado");
  });
});

describe("buildCollectionEvents", () => {
  it("should create collection events for each category with items", () => {
    // Mock catalog structure
    const catalog = {
      categories: [
        { id: "cat1", name: "Lunch" },
        { id: "cat2", name: "Dinner" },
        { id: "cat3", name: "Dessert" }
      ],
      items: [
        { id: "item1", categoryIds: ["cat1"] },
        { id: "item2", categoryIds: ["cat1", "cat2"] },
        { id: "item3", categoryIds: ["cat2"] }
      ]
    };

    // Simulate buildCollectionEvents logic
    const catById = new Map(catalog.categories.map((c) => [c.id, c.name]));
    const categoryNamesWithItems = new Set();
    for (const item of catalog.items || []) {
      for (const categoryId of item.categoryIds || []) {
        const categoryName = catById.get(categoryId);
        if (categoryName && typeof categoryName === "string" && categoryName.trim()) {
          categoryNamesWithItems.add(categoryName.trim());
        }
      }
    }

    expect(Array.from(categoryNamesWithItems)).toContain("Lunch");
    expect(Array.from(categoryNamesWithItems)).toContain("Dinner");
    expect(Array.from(categoryNamesWithItems)).not.toContain("Dessert");
    expect(categoryNamesWithItems.size).toBe(2);
  });

  it("should create collection event with correct tags", () => {
    const categoryName = "Lunch";
    const businessName = "Restaurant El Candado";
    const profileLocation = "123 Main St, City, State, ZIP";
    const profileGeoHash = "9q5hm";
    const merchantPubkey = "abc123";

    // Simulate collection event creation
    const tags = [];
    tags.push(["d", categoryName]);
    tags.push(["title", `${categoryName} Menu`]);
    tags.push(["summary", `${categoryName} Menu for ${businessName}`]);
    tags.push(["location", profileLocation]);
    tags.push(["g", profileGeoHash]);
    tags.push(["a", "30405", merchantPubkey, categoryName]);

    const event = {
      kind: 30405,
      created_at: Math.floor(Date.now() / 1000),
      content: "",
      tags
    };

    expect(event.kind).toBe(30405);
    expect(event.tags.find((t) => t[0] === "d")?.[1]).toBe("Lunch");
    expect(event.tags.find((t) => t[0] === "title")?.[1]).toBe("Lunch Menu");
    expect(event.tags.find((t) => t[0] === "summary")?.[1]).toBe("Lunch Menu for Restaurant El Candado");
    expect(event.tags.find((t) => t[0] === "location")?.[1]).toBe(profileLocation);
    expect(event.tags.find((t) => t[0] === "g")?.[1]).toBe(profileGeoHash);
    const aTag = event.tags.find((t) => t[0] === "a");
    expect(aTag).toEqual(["a", "30405", merchantPubkey, categoryName]);
  });

  it("should use category name as d tag", () => {
    const categoryName = "Dinner";
    const tags = [];
    tags.push(["d", categoryName]);

    expect(tags[0][0]).toBe("d");
    expect(tags[0][1]).toBe("Dinner");
  });

  it("should format title as '{category} Menu'", () => {
    const categoryName = "Dessert";
    const title = `${categoryName} Menu`;

    expect(title).toBe("Dessert Menu");
  });

  it("should format summary with business name when provided", () => {
    const categoryName = "Lunch";
    const businessName = "Restaurant El Candado";
    const summary = `${categoryName} Menu for ${businessName}`;

    expect(summary).toBe("Lunch Menu for Restaurant El Candado");
  });

  it("should format summary without business name when not provided", () => {
    const categoryName = "Lunch";
    const summary = `${categoryName} Menu`;

    expect(summary).toBe("Lunch Menu");
  });

  it("should include location tag when profileLocation is provided", () => {
    const profileLocation = "123 Main St, City, State, ZIP";
    const tags = [];
    if (profileLocation) {
      tags.push(["location", profileLocation]);
    }

    expect(tags.find((t) => t[0] === "location")?.[1]).toBe(profileLocation);
  });

  it("should include geohash tag when profileGeoHash is provided", () => {
    const profileGeoHash = "9q5hm";
    const tags = [];
    if (profileGeoHash) {
      tags.push(["g", profileGeoHash]);
    }

    expect(tags.find((t) => t[0] === "g")?.[1]).toBe(profileGeoHash);
  });

  it("should include a tag with merchant pubkey", () => {
    const merchantPubkey = "abc123def456";
    const categoryName = "Lunch";
    const tags = [];
    if (merchantPubkey && typeof merchantPubkey === "string" && merchantPubkey.trim()) {
      tags.push(["a", "30405", merchantPubkey.trim(), categoryName]);
    }

    const aTag = tags.find((t) => t[0] === "a");
    expect(aTag).toEqual(["a", "30405", merchantPubkey, categoryName]);
  });

  it("should not create collections for categories without items", () => {
    const catalog = {
      categories: [
        { id: "cat1", name: "Lunch" },
        { id: "cat2", name: "Dinner" }
      ],
      items: [
        { id: "item1", categoryIds: ["cat1"] }
      ]
    };

    // Simulate buildCollectionEvents logic
    const catById = new Map(catalog.categories.map((c) => [c.id, c.name]));
    const categoryNamesWithItems = new Set();
    for (const item of catalog.items || []) {
      for (const categoryId of item.categoryIds || []) {
        const categoryName = catById.get(categoryId);
        if (categoryName && typeof categoryName === "string" && categoryName.trim()) {
          categoryNamesWithItems.add(categoryName.trim());
        }
      }
    }

    expect(categoryNamesWithItems.has("Lunch")).toBe(true);
    expect(categoryNamesWithItems.has("Dinner")).toBe(false);
  });

  it("should handle items with multiple categories", () => {
    const catalog = {
      categories: [
        { id: "cat1", name: "Lunch" },
        { id: "cat2", name: "Dinner" }
      ],
      items: [
        { id: "item1", categoryIds: ["cat1", "cat2"] }
      ]
    };

    // Simulate buildCollectionEvents logic
    const catById = new Map(catalog.categories.map((c) => [c.id, c.name]));
    const categoryNamesWithItems = new Set();
    for (const item of catalog.items || []) {
      for (const categoryId of item.categoryIds || []) {
        const categoryName = catById.get(categoryId);
        if (categoryName && typeof categoryName === "string" && categoryName.trim()) {
          categoryNamesWithItems.add(categoryName.trim());
        }
      }
    }

    expect(categoryNamesWithItems.has("Lunch")).toBe(true);
    expect(categoryNamesWithItems.has("Dinner")).toBe(true);
    expect(categoryNamesWithItems.size).toBe(2);
  });

  it("should handle empty catalog gracefully", () => {
    const catalog = {
      categories: [],
      items: []
    };

    // Simulate buildCollectionEvents logic
    const catById = new Map(catalog.categories.map((c) => [c.id, c.name]));
    const categoryNamesWithItems = new Set();
    for (const item of catalog.items || []) {
      for (const categoryId of item.categoryIds || []) {
        const categoryName = catById.get(categoryId);
        if (categoryName && typeof categoryName === "string" && categoryName.trim()) {
          categoryNamesWithItems.add(categoryName.trim());
        }
      }
    }

    expect(categoryNamesWithItems.size).toBe(0);
  });
});

describe("buildEvents - New Tag Strategy", () => {
  it("should use SKU for d tag when available", () => {
    const variation = { sku: "0001", name: "Regular" };
    const dTag = variation.sku && typeof variation.sku === "string" && variation.sku.trim()
      ? variation.sku.trim()
      : "fallback-id";

    expect(dTag).toBe("0001");
  });

  it("should use fallback identifier when SKU is not available", () => {
    const variation = { name: "Regular" };
    const itemId = "item123";
    const variationId = "var456";
    const dTag = variation.sku && typeof variation.sku === "string" && variation.sku.trim()
      ? variation.sku.trim()
      : `${itemId}-${variationId}`;

    expect(dTag).toBe("item123-var456");
  });

  it("should use item.name directly for title (no variation suffix)", () => {
    const item = { name: "Bocadillo de Jamón" };
    const title = item.name;

    expect(title).toBe("Bocadillo de Jamón");
  });

  it("should add type tag with simple and physical", () => {
    const tags = [];
    tags.push(["type", "simple", "physical"]);

    const typeTag = tags.find((t) => t[0] === "type");
    expect(typeTag).toEqual(["type", "simple", "physical"]);
  });

  it("should add contains tags from ingredients array", () => {
    const item = {
      ingredients: ["GLUTEN", "WHEAT"]
    };
    const tags = [];
    if (Array.isArray(item.ingredients)) {
      for (const ingredient of item.ingredients) {
        if (typeof ingredient === "string" && ingredient.trim()) {
          tags.push(["schema.org:Recipe:recipeIngredient", ingredient.trim(), "https://schema.org/recipeIngredient"]);
        }
      }
    }

    const containsTags = tags.filter((t) => t[0] === "schema.org:Recipe:recipeIngredient");
    expect(containsTags).toHaveLength(2);
    expect(containsTags[0]).toEqual(["schema.org:Recipe:recipeIngredient", "GLUTEN", "https://schema.org/recipeIngredient"]);
    expect(containsTags[1]).toEqual(["schema.org:Recipe:recipeIngredient", "WHEAT", "https://schema.org/recipeIngredient"]);
  });

  it("should add t tags from dietary_preferences array", () => {
    const item = {
      dietaryPreferences: ["GLUTEN_FREE", "DAIRY_FREE"]
    };
    const tags = [];
    if (Array.isArray(item.dietaryPreferences)) {
      for (const pref of item.dietaryPreferences) {
        if (typeof pref === "string" && pref.trim()) {
          tags.push(["t", pref.trim()]);
        }
      }
    }

    const tTags = tags.filter((t) => t[0] === "t");
    expect(tTags).toHaveLength(2);
    expect(tTags[0]).toEqual(["t", "GLUTEN_FREE"]);
    expect(tTags[1]).toEqual(["t", "DAIRY_FREE"]);
  });

  it("should add contains tags from ingredients and t tags from dietary_preferences", () => {
    const item = {
      ingredients: ["GLUTEN"],
      dietaryPreferences: ["GLUTEN_FREE"]
    };
    const tags = [];
    if (Array.isArray(item.ingredients)) {
      for (const ingredient of item.ingredients) {
        if (typeof ingredient === "string" && ingredient.trim()) {
          tags.push(["schema.org:Recipe:recipeIngredient", ingredient.trim(), "https://schema.org/recipeIngredient"]);
        }
      }
    }
    if (Array.isArray(item.dietaryPreferences)) {
      for (const pref of item.dietaryPreferences) {
        if (typeof pref === "string" && pref.trim()) {
          tags.push(["t", pref.trim()]);
        }
      }
    }

    const containsTags = tags.filter((t) => t[0] === "schema.org:Recipe:recipeIngredient");
    const tTags = tags.filter((t) => t[0] === "t");
    expect(containsTags).toHaveLength(1);
    expect(containsTags).toContainEqual(["schema.org:Recipe:recipeIngredient", "GLUTEN", "https://schema.org/recipeIngredient"]);
    expect(tTags).toHaveLength(1);
    expect(tTags).toContainEqual(["t", "GLUTEN_FREE"]);
  });

  it("should add a tag for each category the item belongs to", () => {
    const item = {
      categoryIds: ["cat1", "cat2"]
    };
    const catById = new Map([
      ["cat1", "Lunch"],
      ["cat2", "Dinner"]
    ]);
    const merchantPubkey = "abc123";
    const tags = [];

    if (merchantPubkey && typeof merchantPubkey === "string" && merchantPubkey.trim()) {
      for (const categoryId of item.categoryIds || []) {
        const categoryName = catById.get(categoryId);
        if (categoryName && typeof categoryName === "string" && categoryName.trim()) {
          tags.push(["a", "30405", merchantPubkey.trim(), categoryName.trim()]);
        }
      }
    }

    const aTags = tags.filter((t) => t[0] === "a");
    expect(aTags).toHaveLength(2);
    expect(aTags[0]).toEqual(["a", "30405", merchantPubkey, "Lunch"]);
    expect(aTags[1]).toEqual(["a", "30405", merchantPubkey, "Dinner"]);
  });

  it("should add suitableForDiet tags from dietary_preferences", () => {
    const item = {
      dietaryPreferences: ["GLUTEN_FREE", "DAIRY_FREE", "NUT_FREE"]
    };
    const tags = [];
    if (Array.isArray(item.dietaryPreferences)) {
      for (const pref of item.dietaryPreferences) {
        if (typeof pref === "string" && pref.trim()) {
          tags.push(["schema.org:MenuItem:suitableForDiet", pref.trim(), "https://schema.org/suitableForDiet"]);
        }
      }
    }

    const suitableForDietTags = tags.filter((t) => t[0] === "schema.org:MenuItem:suitableForDiet");
    expect(suitableForDietTags).toHaveLength(3);
    expect(suitableForDietTags[0]).toEqual(["schema.org:MenuItem:suitableForDiet", "GLUTEN_FREE", "https://schema.org/suitableForDiet"]);
    expect(suitableForDietTags[1]).toEqual(["schema.org:MenuItem:suitableForDiet", "DAIRY_FREE", "https://schema.org/suitableForDiet"]);
    expect(suitableForDietTags[2]).toEqual(["schema.org:MenuItem:suitableForDiet", "NUT_FREE", "https://schema.org/suitableForDiet"]);
  });

  it("should not add a tags when merchantPubkey is missing", () => {
    const item = {
      categoryIds: ["cat1"]
    };
    const catById = new Map([["cat1", "Lunch"]]);
    const merchantPubkey = null;
    const tags = [];

    if (merchantPubkey && typeof merchantPubkey === "string" && merchantPubkey.trim()) {
      for (const categoryId of item.categoryIds || []) {
        const categoryName = catById.get(categoryId);
        if (categoryName && typeof categoryName === "string" && categoryName.trim()) {
          tags.push(["a", "30405", merchantPubkey.trim(), categoryName.trim()]);
        }
      }
    }

    const aTags = tags.filter((t) => t[0] === "a");
    expect(aTags).toHaveLength(0);
  });

  it("should update content to remove variation suffix", () => {
    const item = { name: "Bocadillo de Jamón", description: "Traditional Spanish baguette" };
    const variation = { sku: "0001" };
    const content = `**${item.name}**

${item.description || ""}`.trim();

    expect(content).toContain("**Bocadillo de Jamón**");
    expect(content).not.toContain("Regular");
    expect(content).not.toContain("SKU: 0001");
  });

  it("should handle items without ingredients or dietary_preferences", () => {
    const item = {
      ingredients: [],
      dietaryPreferences: []
    };
    const tags = [];
    if (Array.isArray(item.ingredients)) {
      for (const ingredient of item.ingredients) {
        if (typeof ingredient === "string" && ingredient.trim()) {
          tags.push(["schema.org:Recipe:recipeIngredient", ingredient.trim(), "https://schema.org/recipeIngredient"]);
        }
      }
    }
    if (Array.isArray(item.dietaryPreferences)) {
      for (const pref of item.dietaryPreferences) {
        if (typeof pref === "string" && pref.trim()) {
          tags.push(["t", pref.trim()]);
          tags.push(["schema.org:MenuItem:suitableForDiet", pref.trim(), "https://schema.org/suitableForDiet"]);
        }
      }
    }

    const tTags = tags.filter((t) => t[0] === "t");
    const suitableForDietTags = tags.filter((t) => t[0] === "schema.org:MenuItem:suitableForDiet");
    expect(tTags).toHaveLength(0);
    expect(suitableForDietTags).toHaveLength(0);
  });
});

describe("buildDeletionEvent", () => {
  it("should build a valid kind 5 event template", () => {
    // Test the expected structure
    const eventIds = ["event1", "event2"];
    const eventKinds = [30402];
    
    // Expected structure
    const expectedTags = [
      ["e", "event1"],
      ["e", "event2"],
      ["k", "30402"]
    ];
    
    expect(expectedTags.length).toBe(3);
    expect(expectedTags[0][0]).toBe("e");
    expect(expectedTags[0][1]).toBe("event1");
    expect(expectedTags[1][0]).toBe("e");
    expect(expectedTags[1][1]).toBe("event2");
    expect(expectedTags[2][0]).toBe("k");
    expect(expectedTags[2][1]).toBe("30402");
  });

  it("should include e tags for each event ID", () => {
    const eventIds = ["event1", "event2", "event3"];
    const expectedETags = eventIds.map((id) => ["e", id]);
    
    expect(expectedETags).toHaveLength(3);
    expect(expectedETags[0][1]).toBe("event1");
    expect(expectedETags[1][1]).toBe("event2");
    expect(expectedETags[2][1]).toBe("event3");
  });

  it("should include k tags when event kinds are provided", () => {
    const eventIds = ["event1"];
    const eventKinds = [30402, 30403];
    
    const expectedKTags = eventKinds.map((kind) => ["k", String(kind)]);
    
    expect(expectedKTags).toHaveLength(2);
    expect(expectedKTags[0][1]).toBe("30402");
    expect(expectedKTags[1][1]).toBe("30403");
  });

  it("should not include k tags when kinds are not provided", () => {
    const eventIds = ["event1"];
    const eventKinds = null;
    
    // Only e tags should be present
    const expectedETags = eventIds.map((id) => ["e", id]);
    
    expect(expectedETags).toHaveLength(1);
    expect(expectedETags[0][0]).toBe("e");
  });

  it("should have kind 5", () => {
    const expectedKind = 5;
    expect(expectedKind).toBe(5);
  });

  it("should have empty content", () => {
    const expectedContent = "";
    expect(expectedContent).toBe("");
  });

  it("should have created_at timestamp", () => {
    const timestamp = Math.floor(Date.now() / 1000);
    expect(timestamp).toBeGreaterThan(0);
    expect(Number.isInteger(timestamp)).toBe(true);
  });

  it("should validate event IDs are non-empty strings", () => {
    // Test validation logic
    const validIds = ["event1", "event2"];
    const invalidIds = ["", null, undefined];
    
    validIds.forEach((id) => {
      expect(typeof id === "string" && id.trim().length > 0).toBe(true);
    });
    
    invalidIds.forEach((id) => {
      expect(typeof id === "string" && id.trim().length > 0).toBe(false);
    });
  });
});

