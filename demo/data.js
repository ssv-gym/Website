/* ==========================================================================
   SSV GYM — DEMO DATA                                                v1.6.0
   What the demo website and demo admin panel start with. Every visitor gets
   this sample content and nothing they change is saved, so edit it freely.
   Photos are stand-ins from Unsplash. The Google rating and reviews are
   sample data in the shape the Google Places API returns.
   ========================================================================== */
const DEMO_DATA = (() => {
  const stock = id => `https://images.unsplash.com/photo-${id}`;
  const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const placeId = 'ChIJD77n3Dup5zsROuYZWtEYmmQ';
  const features = 'Full gym access | Cardio equipment | Complimentary locker';

  const general = {
    gym_name: 'SSV Gym',
    full_name: 'Shree Siddhi Vinayak Gym',
    tagline: 'Train strong. Live strong.',
    description: 'SSV Gym (Shree Siddhi Vinayak Gym) in Virar West: gym floor, CrossFit and functional training, cardio, personal training, diet plans, weight loss and weight gain programmes, a steam room, and pool and carrom.',
    hero_heading: 'Train strong. | Live strong.',
    hero_subtitle: 'Strength, CrossFit and cardio under one roof in Virar West, with personal training and a steam room for recovery.',
    hero_image: stock('1623874514711-0f321325f318'),
    facility_strip: 'Main Gym | CrossFit | Cardio | Steam Room | Pool & Carrom',
    stat_1_value: '5+', stat_1_label: 'Years in Virar',
    stat_2_value: '40+', stat_2_label: 'Machines and stations',
    stat_3_value: '3', stat_3_label: 'Expert trainers',
    stat_4_value: '7', stat_4_label: 'Days a week',
    about_heading: 'Shree Siddhi Vinayak Gym',
    about_text: 'SSV Gym is a Virar West gym for strength training, CrossFit, cardio and functional fitness, whether you are just starting out or training for a goal. | Train with a personal trainer, follow a weight loss or weight gain programme, and recover in the steam room after your session.',
    about_image: stock('1534438327276-14e5300c3a48'),
    about_highlights: 'Personal training | Weight loss and weight gain programmes | CrossFit and functional training | Complimentary lockers',
    facilities_intro: 'A full gym floor, a CrossFit and functional training zone, cardio equipment, a steam room for recovery, and pool and carrom to unwind.',
    services_heading: 'Personal training and diet plans',
    phone: '+91 77588 78588',
    phone_2: '+91 75586 08585',
    whatsapp: '+91 75586 08585',
    address: 'Shree Siddhi Manora Commercial Complex | Datt Mandir Road, above IDBI Bank | Doghar Pada, Sheetal Nagar, Virar West | Vasai-Virar, Maharashtra 401303',
    opening_hours: 'Monday – Saturday: 6:00 AM – 11:00 PM | Sunday: 4:00 PM – 9:00 PM',
    maps_url: 'https://maps.app.goo.gl/EX4aAEYxKCztUjqv6',
    maps_embed_url: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3762.0924582644457!2d72.80667559999999!3d19.451580099999997!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3be7a93bdce7be0f%3A0x649a18d15a19e63a!2sSSV%20Gym!5e0!3m2!1sen!2sin!4v1790316802069!5m2!1sen!2sin',
    instagram_url: 'https://www.instagram.com/ssvgym2021/',
    facebook_url: 'https://www.facebook.com/p/SSV-GYM-100069942823280/',
    featured_badge_text: 'Best value',
    gallery_categories: 'Gym | CrossFit | Training | Equipment | Events',
    review_form: true,
    review_approval: false
  };

  const facilities = [
    { id: 'fac-main', name: 'Main Gym', tags: 'Strength | Bodybuilding | Machines', description: 'The main floor for strength training, bodybuilding and machine work.', image_url: stock('1637430308606-86576d8fef3c'), category: 'major', active: true, display_order: 1 },
    { id: 'fac-crossfit', name: 'CrossFit', tags: 'Functional Training | Conditioning', description: 'A dedicated zone for CrossFit, functional movements and conditioning circuits.', image_url: stock('1536922246289-88c42f957773'), category: 'major', active: true, display_order: 2 },
    { id: 'fac-steam', name: 'Steam Room', tags: 'Recovery | Relaxation', description: 'Unwind and recover in the steam room after your workout.', image_url: stock('1759216852954-88e547b8e01f'), category: 'major', active: true, display_order: 3 },
    { id: 'fac-cardio', name: 'Cardio', tags: '', description: 'Cardio equipment for warm-ups, endurance and fat loss.', image_url: '', category: 'additional', active: true, display_order: 4 },
    { id: 'fac-personal-training', name: 'Personal Training', tags: '', description: 'One-to-one coaching built around your goal.', image_url: '', category: 'additional', active: true, display_order: 5 },
    { id: 'fac-weight-loss', name: 'Weight Loss Programme', tags: '', description: 'Training and guidance to lose fat.', image_url: '', category: 'additional', active: true, display_order: 6 },
    { id: 'fac-weight-gain', name: 'Weight Gain Programme', tags: '', description: 'Training and guidance to build muscle and gain healthy weight.', image_url: '', category: 'additional', active: true, display_order: 7 },
    { id: 'fac-changing-room', name: 'Changing Room', tags: '', description: 'A clean changing room to get ready before and after your workout.', image_url: '', category: 'additional', active: true, display_order: 8 },
    { id: 'fac-lockers', name: 'Complimentary Lockers', tags: '', description: 'Keep your things safe while you train.', image_url: '', category: 'additional', active: true, display_order: 9 },
    { id: 'fac-gaming-area', name: 'Gaming Area', tags: 'Pool | Carrom', description: 'A pool table and carrom boards to unwind with friends after training.', image_url: '', category: 'additional', active: true, display_order: 10 }
  ];

  const plans = [
    { id: 'plan-monthly', name: 'Monthly', duration: '1 Month', price: 1800, description: 'Month-to-month membership.', features: 'Full gym access | Cardio equipment | Complimentary locker and steam | General trainer assistance', featured: false, active: true, display_order: 1 },
    { id: 'plan-quarterly', name: 'Quarterly', duration: '3 Months', price: 4500, description: 'Three months to build a steady routine.', features, featured: false, active: true, display_order: 2 },
    { id: 'plan-half-yearly', name: 'Half Yearly', duration: '6 Months', price: 6100, description: 'Six months of consistent training.', features, featured: false, active: true, display_order: 3 },
    { id: 'plan-yearly', name: 'Yearly', duration: '12 Months', price: 8100, description: 'A full year of training.', features, featured: true, active: true, display_order: 4 }
  ];

  const services = [
    { id: 'svc-personal-training', name: 'Personal Training', price: 5000, price_note: 'Starting price', description: 'One-on-one personal training sessions built around your goal.', active: true, display_order: 1 },
    { id: 'svc-diet-plan', name: 'Diet Plan', price: 1250, price_note: 'Per session', description: 'A personalised diet plan to support your training.', active: true, display_order: 2 }
  ];

  const trainers = [
    { id: 'tr-aman-verma', name: 'Aman Verma', role: 'Head Trainer', specialization: 'Strength training and bodybuilding', bio: 'Helps members build strength with sound technique and a clear plan.', image_url: stock('1567013127542-490d757e51fc'), active: true, display_order: 1 },
    { id: 'tr-neha-kulkarni', name: 'Neha Kulkarni', role: 'Fitness Coach', specialization: 'Weight loss and functional training', bio: 'Builds sustainable routines for fat loss and everyday fitness.', image_url: stock('1594381898411-846e7d193883'), active: true, display_order: 2 },
    { id: 'tr-vikram-singh', name: 'Vikram Singh', role: 'CrossFit Coach', specialization: 'CrossFit and conditioning', bio: 'Runs high-energy conditioning sessions for all fitness levels.', image_url: stock('1583454110551-21f2fa2afe61'), active: true, display_order: 3 }
  ];

  const gallery = [
    ['main-gym-floor', '1728486145245-d4cb0c9c3470', 'Main gym floor', 'gym'],
    ['battle-ropes', '1548690312-e3b507d8c110', 'Battle ropes', 'crossfit'],
    ['strength-machines', '1571902943202-507ec2618e8f', 'Strength machines', 'equipment'],
    ['barbell-session', '1517836357463-d25dfeac3438', 'Barbell session', 'training'],
    ['dumbbell-rack', '1576678927484-cc907957088c', 'Dumbbell rack', 'equipment'],
    ['kettlebell-work', '1601422407692-ec4eeec1d9b3', 'Kettlebell work', 'crossfit'],
    ['weights-area', '1689877020200-403d8542d95d', 'Weights area', 'gym'],
    ['focused-training', '1526506118085-60ce8714f8c5', 'Focused training', 'training'],
    ['steam-room', '1759216852954-88e547b8e01f', 'Steam room', 'gym'],
    ['group-session', '1593079831268-3381b0db4a77', 'Group session', 'events'],
    ['equipment-detail', '1590487988256-9ed24133863e', 'Equipment', 'equipment'],
    ['lifting-practice', '1605296867304-46d5465a13f1', 'Lifting practice', 'training']
  ].map(([id, photo, title, category], i) => ({ id: `img-${id}`, image_url: stock(photo), title, category, active: true, display_order: i + 1 }));

  const announcements = [
    { id: 'ann-push-up-challenge', title: 'Push-up challenge', description: 'How many push-ups can you do in one minute? Open to members and friends, with prizes for the top three.', image_url: stock('1517836357463-d25dfeac3438'), date: day(-10), expiry: day(-11), active: true, priority: 2 },
    { id: 'ann-turf-cricket', title: 'SSV turf cricket tournament', description: 'Six-a-side teams, one evening of cricket. Make a team with your gym friends and register at the front desk.', image_url: stock('1593079831268-3381b0db4a77'), date: day(-24), expiry: day(-25), active: true, priority: 1 },
    { id: 'ann-crossfit-batch', title: 'New morning CrossFit batch', description: 'Monday, Wednesday and Friday at 7:00 AM, starting next week.', image_url: '', date: day(0), expiry: day(-14), active: true, priority: 2 }
  ];

  const reviews = [
    { id: 'rev-rohit', name: 'Rohit P.', rating: 5, review: 'Great equipment and the trainers actually check your form. Lost 8 kg in four months on the weight loss programme.', likes: 14, date: day(12), source: 'Website', status: 'Published' },
    { id: 'rev-sneha', name: 'Sneha D.', rating: 5, review: 'Clean, well kept and never too crowded in the mornings. The steam room after a workout is the best part.', likes: 9, date: day(20), source: 'Website', status: 'Published' },
    { id: 'rev-karan', name: 'Karan M.', rating: 4, review: 'Good CrossFit sessions with a friendly group. Parking can be tight in the evening.', likes: 6, date: day(5), source: 'Website', status: 'Published' },
    { id: 'rev-pooja', name: 'Pooja S.', rating: 5, review: 'Joined as a complete beginner and felt welcome from day one. The coaches set up a plan that fits my schedule and keep me motivated every week. Highly recommended for anyone in Virar West who wants to get fit without feeling judged.', likes: 4, date: day(3), source: 'Website', status: 'Published' },
    { id: 'rev-amit', name: 'Amit K.', rating: 4, review: 'Solid gym with everything you need. Would love a few more squat racks.', likes: 2, date: day(1), source: 'Website', status: 'Published' },
    { id: 'rev-nikhil', name: 'Nikhil R.', rating: 5, review: 'Open till 11 PM, which is perfect after work.', likes: 0, date: day(0), source: 'Website', status: 'Pending' },
    { id: 'rev-promo', name: 'Best Deals', rating: 1, review: 'Cheap supplements, message me for offers!!!', likes: 0, date: day(2), source: 'Website', status: 'Hidden' }
  ];

  const enquiries = [
    { id: 'enq-demo-1', name: 'Rahul Patil', phone: '+91 98200 00001', message: 'What are the timings for the CrossFit batch?', date: `${day(0)} 09:40`, status: 'New' },
    { id: 'enq-demo-2', name: 'Priya Naik', phone: '+91 98200 00002', message: 'Is there a trial session for new members?', date: `${day(1)} 18:15`, status: 'New' },
    { id: 'enq-demo-3', name: 'Suresh Gawde', phone: '+91 98200 00003', message: 'I am interested in the Yearly plan.', date: `${day(3)} 11:05`, status: 'Contacted' },
    { id: 'enq-demo-4', name: 'Meera Joshi', phone: '+91 98200 00004', message: '', date: `${day(9)} 07:30`, status: 'Closed' }
  ];

  /* Sample Google data. No "write a review" link, so demo visitors aren't sent to the real review form. */
  const google = {
    placeId,
    reviewsUrl: `https://search.google.com/local/reviews?placeid=${placeId}`,
    mapsUrl: 'https://maps.app.goo.gl/EX4aAEYxKCztUjqv6',
    name: 'SSV Gym',
    rating: 4.9,
    count: 220,
    reviews: [
      { name: 'Siddharth M.', rating: 5, time: '2 weeks ago', text: 'Plenty of machines, a clean floor, and the trainers keep an eye on your form without being asked.' },
      { name: 'Anjali K.', rating: 5, time: 'a month ago', text: 'Joined for weight loss and the diet plan was simple to follow. The Sunday evening timing is handy.' },
      { name: 'Rahul D.', rating: 5, time: '2 months ago', text: 'Great CrossFit zone and a friendly crowd. The steam room after a heavy session is the best part of the day.' },
      { name: 'Farhan S.', rating: 4, time: '3 months ago', text: 'Good equipment and fair fees. It gets busy around 7 PM, so mornings are better if you can make it.' }
    ]
  };

  /* Photos in the media library, filed in the website's folders. */
  const media = [
    ['Home', 'hero', general.hero_image],
    ['Home', 'about', general.about_image],
    ...facilities.filter(f => f.image_url).map(f => ['Facilities', f.id.replace('fac-', ''), f.image_url]),
    ...trainers.map(t => ['Trainers', t.id.replace('tr-', ''), t.image_url]),
    ...gallery.map(g => ['Gallery', g.id.replace('img-', ''), g.image_url]),
    ...announcements.filter(a => a.image_url).map(a => ['Events', a.id.replace('ann-', ''), a.image_url])
  ].map(([folder, name, url], i) => ({ id: `SSV-Gym/${folder}/${name}`, type: 'image', url, folder: `SSV-Gym/${folder}`, bytes: 180000 + i * 7919, width: 1600, height: 1067, created: `${day(40 - i)}T10:00:00Z` }));

  return { general, facilities, plans, services, trainers, gallery, reviews, announcements, enquiries, google, media };
})();
