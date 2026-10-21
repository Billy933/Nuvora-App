-- Seed the menu from the supplied menu-items documents. Prices are ETB converted
-- to santim, matching the storefront's integer minor-unit representation.
-- The web photos are bundled under web/public/menu-items and served at /menu-items.
begin;
insert into public.menu(name, category, description, price, image, available)
select items.name, items.category, items.description, items.price,
       items.image, true
from (values
  ('Arrabbiata', 'Pasta', 'Penne coated in a spicy tomato sauce with garlic and herbs.', 55000, '/menu-items/arrabbiata.jpg'),
  ('BBQ Chicken Pizza - Medium', 'Pizza', 'Barbecue sauce, chicken, mozzarella, onion and bell pepper on a golden pizza crust.', 65000, '/menu-items/bbq-chicken-pizza.jpg'),
  ('BBQ Chicken Pizza - Large', 'Pizza', 'Barbecue sauce, chicken, mozzarella, onion and bell pepper on a golden pizza crust.', 105000, '/menu-items/bbq-chicken-pizza.jpg'),
  ('BBQ Smoke Burger', 'Burgers', 'A beef burger with melted cheddar, sweet caramelized onion and smoky barbecue sauce in a sesame bun.', 75000, '/menu-items/bbq-smoke-burger.jpg'),
  ('Beef Pepperoni Pizza - Medium', 'Pizza', 'Tomato sauce, melted mozzarella and slices of beef pepperoni on a golden pizza crust.', 65000, '/menu-items/beef-pepperoni-pizza.jpg'),
  ('Beef Pepperoni Pizza - Large', 'Pizza', 'Tomato sauce, melted mozzarella and slices of beef pepperoni on a golden pizza crust.', 105000, '/menu-items/beef-pepperoni-pizza.jpg'),
  ('Bolognese', 'Pasta', 'Spaghetti topped with a rich tomato and beef sauce, slowly simmered with finely chopped vegetables.', 65000, '/menu-items/bolognese.jpg'),
  ('Chicken Alfredo', 'Pasta', 'Fettuccine in a creamy Alfredo sauce, topped with juicy grilled chicken and a little parsley.', 75000, '/menu-items/chicken-alfredo.jpg'),
  ('Nuvora Box 2 Pieces with Fries', 'Chicken', '2 pieces of golden, crunchy fried chicken with a tender, juicy centre, served with crisp French fries.', 50000, '/menu-items/chicken-box-2-pieces.jpg'),
  ('Nuvora Box 3 Pieces with Fries', 'Chicken', '3 pieces of golden, crunchy fried chicken with a tender, juicy centre, served with crisp French fries.', 65000, '/menu-items/chicken-box-3-pieces.jpg'),
  ('Nuvora Box 4 Pieces with Fries', 'Chicken', '4 pieces of golden, crunchy fried chicken with a tender, juicy centre, served with crisp French fries.', 85000, '/menu-items/chicken-box-4-pieces.jpg'),
  ('Chicken Tenders', 'Sides', 'Golden breaded chicken strips with a crunchy coating, served with a creamy dipping sauce.', 35000, '/menu-items/chicken-tenders.jpg'),
  ('Classic Burger', 'Burgers', 'A juicy beef burger layered with cheddar, lettuce, tomato and red onion in a toasted sesame bun.', 65000, '/menu-items/classic-burger.jpg'),
  ('Creamy Mushroom', 'Pasta', 'Fettuccine tossed in a creamy sauce with a generous mix of browned mushrooms.', 65000, '/menu-items/creamy-mushroom.jpg'),
  ('Crispy Chicken Burger', 'Burgers', 'Crunchy breaded chicken breast with fresh lettuce and creamy mayonnaise in a toasted sesame bun.', 65000, '/menu-items/crispy-chicken-burger.jpg'),
  ('Double Smash', 'Burgers', 'Two thin beef patties with crisp seared edges, melted cheddar, pickles and burger sauce in a toasted bun.', 85000, '/menu-items/double-smash.jpg'),
  ('Family Bucket 10 Pieces', 'Chicken', '10 pieces of golden, crunchy fried chicken with a tender, juicy centre, packed for sharing.', 199000, '/menu-items/family-bucket-10-pieces.jpg'),
  ('Family Bucket 6 Pieces', 'Chicken', '6 pieces of golden, crunchy fried chicken with a tender, juicy centre, packed for sharing.', 119000, '/menu-items/family-bucket-6-pieces.jpg'),
  ('Fries', 'Sides', 'Golden French fries with a crisp exterior, soft potato centre and a light seasoning of salt.', 20000, '/menu-items/fries.jpg'),
  ('Loaded Fries', 'Sides', 'Crisp fries topped with seasoned beef, melted cheddar, creamy sauce and chopped spring onion.', 35000, '/menu-items/loaded-fries.jpg'),
  ('Margherita Pizza - Medium', 'Pizza', 'Tomato sauce, melted mozzarella and fresh basil on a golden pizza crust.', 55000, '/menu-items/margherita-pizza.jpg'),
  ('Margherita Pizza - Large', 'Pizza', 'Tomato sauce, melted mozzarella and fresh basil on a golden pizza crust.', 85000, '/menu-items/margherita-pizza.jpg'),
  ('Nuvora Special Pizza - Medium', 'Pizza', 'A generously topped signature pizza with chicken, beef pepperoni, mushrooms, bell pepper, olives and mozzarella.', 75000, '/menu-items/nuvora-special-pizza.jpg'),
  ('Nuvora Special Pizza - Large', 'Pizza', 'A generously topped signature pizza with chicken, beef pepperoni, mushrooms, bell pepper, olives and mozzarella.', 115000, '/menu-items/nuvora-special-pizza.jpg'),
  ('Onion Rings', 'Sides', 'Thick onion rings in a light, crisp golden batter, served with dipping sauce.', 25000, '/menu-items/onion-rings.jpg')
) as items(name, category, description, price, image)
where not exists (select 1 from public.menu existing where existing.name = items.name);
commit;
