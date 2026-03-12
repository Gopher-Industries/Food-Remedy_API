| Product             | Expected Allergens                               | Allergens Detected                                   | Evaluation                                               |
|---------------------|---------------------------------------------------|-------------------------------------------------------|-----------------------------------------------------------|
| Tuna Tomato and Onion | Fish (categories: tunas, fishes)                 | ["Fish"]                                              | Correct                                                   |
| Vegetable oil       | None                                              | []                                                    | Correct                                                   |
| Enchilada Kit       | Gluten (wheat)                                    | ["Gluten"]                                            | Correct                                                   |
| Peanut butter       | Peanuts (product name + categories)               | ["Peanuts"]                                           | Correct                                                   |
| Nutella             | Milk, Soy, Tree Nuts (hazelnuts)                  | ["Milk", "Soy", "Tree Nuts"]                          | Correct                                                   |
| Tiger Prawns        | Crustacea (prawns, shellfish)                     | ["Crustacea"]                                         | Correct                                                   |
| Mi Goreng           | Gluten, Sesame, Soy                               | ["Gluten", "Sesame", "Soy", "Sulphites"]             | Correct (Sulphites detected from numeric code; reasonable) |
| Iced coffee         | Milk                                              | ["Milk"]                                              | Correct                                                   |
| Soft Brown Bread    | Egg                                               | ["Egg"]                                               | Correct                                                   |
| 9 Grain Wholemeal   | Gluten, Soy (traces: Sesame, Fish)                | ["Fish", "Gluten", "Sesame", "Soy"]                  | Correct (traces explicitly listed)                        |
| Lindt Lindor        | Milk, Soy, Tree Nuts (traces: Peanuts)            | ["Gluten", "Milk", "Soy", "Tree Nuts"]               | Correct — barley malt legitimately triggers Gluten        |
