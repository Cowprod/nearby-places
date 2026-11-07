#pragma once
#import <UIKit/UIKit.h>
#import <MapKit/MapKit.h>

// One implementation per executable, shared by the app and ShareExt.
@interface NearbyPlacePicker : UIViewController <UITableViewDataSource, UITableViewDelegate, MKMapViewDelegate, UISearchBarDelegate>
@property(nonatomic, copy) NSString *placeName;
@property(nonatomic, copy) void (^completion)(NSDictionary *, NSString *);
@property(nonatomic, strong) MKMapView *map;
@property(nonatomic, strong) UITableView *table;
@property(nonatomic, strong) UISearchBar *searchBar;
@property(nonatomic, strong) UITextField *nameField;
@property(nonatomic, strong) UILabel *message;
@property(nonatomic, copy) NSArray<MKMapItem *> *candidates;
@property(nonatomic, strong) MKPointAnnotation *selectedPin;
@property(nonatomic, strong) MKLocalSearch *search;
@property(nonatomic) NSUInteger searchGeneration;
@end

@implementation NearbyPlacePicker
- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = UIColor.systemBackgroundColor;
    self.title = @"Choisir le lieu";
    self.navigationItem.leftBarButtonItem = [[UIBarButtonItem alloc] initWithTitle:@"Annuler" style:UIBarButtonItemStylePlain target:self action:@selector(cancelSelection)];
    self.navigationItem.rightBarButtonItem = [[UIBarButtonItem alloc] initWithTitle:@"Confirmer" style:UIBarButtonItemStyleDone target:self action:@selector(confirmSelection)];
    self.navigationItem.rightBarButtonItem.enabled = NO;
    UIStackView *stack = [[UIStackView alloc] init];
    stack.axis = UILayoutConstraintAxisVertical;
    stack.spacing = 8;
    stack.translatesAutoresizingMaskIntoConstraints = NO;
    [self.view addSubview:stack];
    [NSLayoutConstraint activateConstraints:@[
        [stack.topAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.topAnchor],
        [stack.bottomAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.bottomAnchor],
        [stack.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor constant:12],
        [stack.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor constant:-12]
    ]];
    self.searchBar = [[UISearchBar alloc] init];
    self.searchBar.placeholder = @"Rechercher un nom ou une adresse";
    self.searchBar.text = self.placeName;
    self.searchBar.delegate = self;
    [stack addArrangedSubview:self.searchBar];
    self.nameField = [[UITextField alloc] init];
    self.nameField.text = self.placeName;
    self.nameField.placeholder = @"Nom du lieu (obligatoire)";
    self.nameField.borderStyle = UITextBorderStyleRoundedRect;
    [stack addArrangedSubview:self.nameField];
    self.message = [[UILabel alloc] init];
    self.message.numberOfLines = 0;
    self.message.font = [UIFont preferredFontForTextStyle:UIFontTextStyleFootnote];
    self.message.text = @"Choisissez un résultat ou faites un appui long sur la carte pour placer le point. Puis confirmez.";
    [stack addArrangedSubview:self.message];
    self.map = [[MKMapView alloc] init];
    self.map.delegate = self;
    [self.map addGestureRecognizer:[[UILongPressGestureRecognizer alloc] initWithTarget:self action:@selector(placePin:)]];
    [stack addArrangedSubview:self.map];
    [self.map.heightAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.heightAnchor multiplier:0.38].active = YES;
    self.table = [[UITableView alloc] initWithFrame:CGRectZero style:UITableViewStylePlain];
    self.table.dataSource = self;
    self.table.delegate = self;
    self.table.rowHeight = UITableViewAutomaticDimension;
    self.table.estimatedRowHeight = 60;
    [stack addArrangedSubview:self.table];
    [self searchBarSearchButtonClicked:self.searchBar];
}

- (void)searchBarSearchButtonClicked:(UISearchBar *)searchBar {
    [self.view endEditing:YES];
    [self.search cancel];
    NSUInteger generation = ++self.searchGeneration;
    NSString *query = [searchBar.text stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
    if (!query.length) { self.message.text = @"Saisissez un nom ou une adresse, ou placez le point sur la carte."; return; }
    self.message.text = @"Recherche des lieux candidats…";
    MKLocalSearchRequest *request = [[MKLocalSearchRequest alloc] init];
    request.naturalLanguageQuery = query;
    self.search = [[MKLocalSearch alloc] initWithRequest:request];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW,20*NSEC_PER_SEC),dispatch_get_main_queue(),^{
        if (generation != self.searchGeneration) return;
        self.searchGeneration++;
        [self.search cancel];
        self.message.text = @"La recherche a dépassé le délai. Réessayez ou placez le point sur la carte.";
    });
    [self.search startWithCompletionHandler:^(MKLocalSearchResponse *response, NSError *error) {
        dispatch_async(dispatch_get_main_queue(), ^{
            if (generation != self.searchGeneration) return;
            self.searchGeneration++;
            self.candidates = response.mapItems ?: @[];
            [self.table reloadData];
            [self.map removeAnnotations:self.map.annotations];
            if (self.selectedPin) [self.map addAnnotation:self.selectedPin];
            for (MKMapItem *item in self.candidates) {
                MKPointAnnotation *pin = [[MKPointAnnotation alloc] init];
                pin.coordinate = item.placemark.coordinate;
                pin.title = item.name;
                pin.subtitle = item.placemark.title;
                [self.map addAnnotation:pin];
            }
            if (self.candidates.count) [self.map showAnnotations:self.map.annotations animated:YES];
            self.message.text = error ? [NSString stringWithFormat:@"Recherche impossible : %@. Vous pouvez placer le point sur la carte.",error.localizedDescription] : (self.candidates.count ? @"Vérifiez le nom, l’adresse et le point sur la carte avant de confirmer." : @"Aucun résultat. Précisez l’adresse ou placez le point par un appui long sur la carte.");
        });
    }];
}

- (NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section { return self.candidates.count; }
- (UITableViewCell *)tableView:(UITableView *)tableView cellForRowAtIndexPath:(NSIndexPath *)indexPath {
    UITableViewCell *cell = [[UITableViewCell alloc] initWithStyle:UITableViewCellStyleSubtitle reuseIdentifier:nil];
    MKMapItem *item = self.candidates[indexPath.row];
    cell.textLabel.text = item.name;
    cell.detailTextLabel.text = item.placemark.title;
    cell.detailTextLabel.numberOfLines = 0;
    return cell;
}
- (void)tableView:(UITableView *)tableView didSelectRowAtIndexPath:(NSIndexPath *)indexPath {
    MKMapItem *item = self.candidates[indexPath.row];
    [self selectCoordinate:item.placemark.coordinate name:item.name];
}
- (void)mapView:(MKMapView *)mapView didSelectAnnotationView:(MKAnnotationView *)view {
    if (view.annotation == self.selectedPin) return;
    [self selectCoordinate:view.annotation.coordinate name:view.annotation.title];
}
- (void)placePin:(UILongPressGestureRecognizer *)gesture {
    if (gesture.state != UIGestureRecognizerStateBegan) return;
    [self selectCoordinate:[self.map convertPoint:[gesture locationInView:self.map] toCoordinateFromView:self.map] name:self.nameField.text];
}
- (void)selectCoordinate:(CLLocationCoordinate2D)coordinate name:(NSString *)name {
    if (!CLLocationCoordinate2DIsValid(coordinate)) return;
    [self.view endEditing:YES];
    if (self.selectedPin) [self.map removeAnnotation:self.selectedPin];
    self.selectedPin = [[MKPointAnnotation alloc] init];
    self.selectedPin.coordinate = coordinate;
    self.selectedPin.title = @"Point sélectionné";
    [self.map addAnnotation:self.selectedPin];
    if (name.length) self.nameField.text = name;
    [self.map setRegion:MKCoordinateRegionMakeWithDistance(coordinate,600,600) animated:YES];
    self.message.text = [NSString stringWithFormat:@"Point sélectionné : %.6f, %.6f. Vérifiez puis confirmez.", coordinate.latitude, coordinate.longitude];
    self.navigationItem.rightBarButtonItem.enabled = YES;
}
- (void)confirmSelection {
    NSString *name = [self.nameField.text stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
    if (!name.length || !self.selectedPin) { self.message.text = @"Un nom et un point sélectionné sont obligatoires."; return; }
    NSDictionary *selection = @{@"name":name, @"latitude":@(self.selectedPin.coordinate.latitude), @"longitude":@(self.selectedPin.coordinate.longitude)};
    self.navigationItem.rightBarButtonItem.enabled = NO;
    self.searchGeneration++;
    [self.search cancel];
    [self dismissViewControllerAnimated:YES completion:^{ if (self.completion) self.completion(selection,nil); }];
}
- (void)cancelSelection {
    self.searchGeneration++;
    [self.search cancel];
    [self dismissViewControllerAnimated:YES completion:^{ if (self.completion) self.completion(nil,@"Sélection annulée ; import conservé"); }];
}
@end
