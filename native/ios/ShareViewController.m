#import "ShareViewController.h"
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

static NSString * const NearbyAppGroup = @"group.fr.cowprod.nearbyplaces.shareextension";
static NSString * const NearbyQueueKey = @"nearbyShareQueue";
static NSString * const NearbyCategoriesKey = @"nearbyCategories";
static const NSUInteger NearbyQueueLimit = 50;

@interface ShareViewController ()
@property(nonatomic, strong) UIScrollView *scrollView;
@property(nonatomic, strong) NSLayoutConstraint *scrollBottomConstraint;
@property(nonatomic, strong) UIActivityIndicatorView *activityIndicator;
@property(nonatomic, strong) UILabel *statusLabel;
@property(nonatomic, strong) UILabel *urlLabel;
@property(nonatomic, strong) UITextField *nameField;
@property(nonatomic, strong) UITextView *commentView;
@property(nonatomic, strong) UIPickerView *categoryPicker;
@property(nonatomic, strong) UIButton *saveButton;
@property(nonatomic, copy) NSArray<NSDictionary *> *categories;
@property(nonatomic, copy) NSString *sharedURL;
@property(nonatomic, strong) NSMutableArray<NSString *> *sharedTexts;
@property(nonatomic, assign) BOOL startedLoading;
@end

@implementation ShareViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = UIColor.systemBackgroundColor;
    self.sharedTexts = [NSMutableArray array];
    self.categories = [self loadCategories];
    [self buildForm];
    NSNotificationCenter *center = NSNotificationCenter.defaultCenter;
    [center addObserver:self selector:@selector(keyboardWillChange:) name:UIKeyboardWillChangeFrameNotification object:nil];
    [center addObserver:self selector:@selector(keyboardWillHide:) name:UIKeyboardWillHideNotification object:nil];
}

- (void)viewDidAppear:(BOOL)animated {
    [super viewDidAppear:animated];
    if (self.startedLoading) return;
    self.startedLoading = YES;
    [self loadSharedContent];
}

- (void)dealloc { [NSNotificationCenter.defaultCenter removeObserver:self]; }

- (NSArray<NSDictionary *> *)canonicalCategories {
    return @[
        @{ @"id": @"culture", @"name": @"Culture" },
        @{ @"id": @"resto", @"name": @"Restaurant" },
        @{ @"id": @"musique", @"name": @"Musique" },
        @{ @"id": @"transport", @"name": @"Transport" },
        @{ @"id": @"occasion", @"name": @"Occasion" },
        @{ @"id": @"modelisme", @"name": @"Modélisme" }
    ];
}

- (NSArray<NSDictionary *> *)loadCategories {
    NSUserDefaults *defaults = [[NSUserDefaults alloc] initWithSuiteName:NearbyAppGroup];
    id stored = [defaults objectForKey:NearbyCategoriesKey];
    if (![stored isKindOfClass:NSArray.class] || [(NSArray *)stored count] == 0) return [self canonicalCategories];
    NSMutableArray *valid = [NSMutableArray array];
    for (id item in (NSArray *)stored) {
        if (![item isKindOfClass:NSDictionary.class]) continue;
        NSString *identifier = [item[@"id"] isKindOfClass:NSString.class] ? item[@"id"] : nil;
        NSString *name = [item[@"name"] isKindOfClass:NSString.class] ? item[@"name"] : nil;
        if (identifier.length && name.length) [valid addObject:@{ @"id": identifier, @"name": name }];
    }
    return valid.count ? valid : [self canonicalCategories];
}

- (UILabel *)fieldLabel:(NSString *)text {
    UILabel *label = [[UILabel alloc] init];
    label.text = text;
    label.font = [UIFont preferredFontForTextStyle:UIFontTextStyleHeadline];
    return label;
}

- (void)buildForm {
    self.scrollView = [[UIScrollView alloc] init];
    self.scrollView.translatesAutoresizingMaskIntoConstraints = NO;
    self.scrollView.keyboardDismissMode = UIScrollViewKeyboardDismissModeInteractive;
    [self.view addSubview:self.scrollView];
    self.scrollBottomConstraint = [self.scrollView.bottomAnchor constraintEqualToAnchor:self.view.bottomAnchor];
    [NSLayoutConstraint activateConstraints:@[
        [self.scrollView.topAnchor constraintEqualToAnchor:self.view.topAnchor],
        [self.scrollView.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor],
        [self.scrollView.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor],
        self.scrollBottomConstraint
    ]];
    UIStackView *stack = [[UIStackView alloc] init];
    stack.axis = UILayoutConstraintAxisVertical;
    stack.spacing = 10;
    stack.translatesAutoresizingMaskIntoConstraints = NO;
    [self.scrollView addSubview:stack];
    [NSLayoutConstraint activateConstraints:@[
        [stack.topAnchor constraintEqualToAnchor:self.scrollView.contentLayoutGuide.topAnchor constant:18],
        [stack.leadingAnchor constraintEqualToAnchor:self.scrollView.frameLayoutGuide.leadingAnchor constant:20],
        [stack.trailingAnchor constraintEqualToAnchor:self.scrollView.frameLayoutGuide.trailingAnchor constant:-20],
        [stack.bottomAnchor constraintEqualToAnchor:self.scrollView.contentLayoutGuide.bottomAnchor constant:-18]
    ]];
    UILabel *title = [[UILabel alloc] init];
    title.text = @"Ajouter à Nearby Places";
    title.font = [UIFont preferredFontForTextStyle:UIFontTextStyleTitle2];
    title.adjustsFontForContentSizeCategory = YES;
    [stack addArrangedSubview:title];
    self.activityIndicator = [[UIActivityIndicatorView alloc] initWithActivityIndicatorStyle:UIActivityIndicatorViewStyleMedium];
    [self.activityIndicator startAnimating];
    [stack addArrangedSubview:self.activityIndicator];
    self.statusLabel = [[UILabel alloc] init];
    self.statusLabel.text = @"Lecture du lieu partagé…";
    self.statusLabel.numberOfLines = 0;
    self.statusLabel.textColor = UIColor.secondaryLabelColor;
    [stack addArrangedSubview:self.statusLabel];
    self.urlLabel = [[UILabel alloc] init];
    self.urlLabel.numberOfLines = 2;
    self.urlLabel.font = [UIFont preferredFontForTextStyle:UIFontTextStyleCaption1];
    self.urlLabel.textColor = UIColor.secondaryLabelColor;
    self.urlLabel.hidden = YES;
    [stack addArrangedSubview:self.urlLabel];
    [stack addArrangedSubview:[self fieldLabel:@"Nom *"]];
    self.nameField = [[UITextField alloc] init];
    self.nameField.placeholder = @"Nom du lieu";
    self.nameField.borderStyle = UITextBorderStyleRoundedRect;
    self.nameField.clearButtonMode = UITextFieldViewModeWhileEditing;
    self.nameField.returnKeyType = UIReturnKeyDone;
    self.nameField.enabled = NO;
    [self.nameField addTarget:self action:@selector(dismissKeyboard) forControlEvents:UIControlEventEditingDidEndOnExit];
    [stack addArrangedSubview:self.nameField];
    [stack addArrangedSubview:[self fieldLabel:@"Commentaire"]];
    self.commentView = [[UITextView alloc] init];
    self.commentView.font = [UIFont preferredFontForTextStyle:UIFontTextStyleBody];
    self.commentView.layer.borderColor = UIColor.separatorColor.CGColor;
    self.commentView.layer.borderWidth = 1;
    self.commentView.layer.cornerRadius = 8;
    self.commentView.editable = NO;
    [self.commentView.heightAnchor constraintEqualToConstant:88].active = YES;
    [stack addArrangedSubview:self.commentView];
    [stack addArrangedSubview:[self fieldLabel:@"Catégorie"]];
    self.categoryPicker = [[UIPickerView alloc] init];
    self.categoryPicker.dataSource = self;
    self.categoryPicker.delegate = self;
    self.categoryPicker.userInteractionEnabled = NO;
    [self.categoryPicker.heightAnchor constraintEqualToConstant:132].active = YES;
    [stack addArrangedSubview:self.categoryPicker];
    UIStackView *buttons = [[UIStackView alloc] init];
    buttons.axis = UILayoutConstraintAxisHorizontal;
    buttons.spacing = 12;
    buttons.distribution = UIStackViewDistributionFillEqually;
    UIButton *cancel = [UIButton buttonWithType:UIButtonTypeSystem];
    [cancel setTitle:@"Annuler" forState:UIControlStateNormal];
    [cancel addTarget:self action:@selector(cancel) forControlEvents:UIControlEventTouchUpInside];
    [buttons addArrangedSubview:cancel];
    self.saveButton = [UIButton buttonWithType:UIButtonTypeSystem];
    [self.saveButton setTitle:@"Enregistrer" forState:UIControlStateNormal];
    self.saveButton.titleLabel.font = [UIFont preferredFontForTextStyle:UIFontTextStyleHeadline];
    self.saveButton.enabled = NO;
    [self.saveButton addTarget:self action:@selector(save) forControlEvents:UIControlEventTouchUpInside];
    [buttons addArrangedSubview:self.saveButton];
    [stack addArrangedSubview:buttons];
    self.preferredContentSize = CGSizeMake(0, 570);
}

- (void)dismissKeyboard { [self.view endEditing:YES]; }

- (void)keyboardWillChange:(NSNotification *)notification {
    CGRect keyboard = [notification.userInfo[UIKeyboardFrameEndUserInfoKey] CGRectValue];
    CGRect local = [self.view convertRect:keyboard fromView:nil];
    CGFloat overlap = MAX(0, CGRectGetMaxY(self.view.bounds) - CGRectGetMinY(local));
    self.scrollBottomConstraint.constant = -overlap;
    [self animateKeyboard:notification];
}

- (void)keyboardWillHide:(NSNotification *)notification {
    self.scrollBottomConstraint.constant = 0;
    [self animateKeyboard:notification];
}

- (void)animateKeyboard:(NSNotification *)notification {
    NSTimeInterval duration = [notification.userInfo[UIKeyboardAnimationDurationUserInfoKey] doubleValue];
    [UIView animateWithDuration:duration animations:^{ [self.view layoutIfNeeded]; }];
}

- (void)loadSharedContent {
    NSArray *inputItems = self.extensionContext.inputItems;
    if (inputItems.count == 0) {
        [self showError:@"Aucune donnée n’a été fournie par l’application source."];
        return;
    }
    dispatch_group_t group = dispatch_group_create();
    for (id object in inputItems) {
        if (![object isKindOfClass:NSExtensionItem.class]) continue;
        NSExtensionItem *item = object;
        if (item.attributedTitle.string.length) [self.sharedTexts addObject:item.attributedTitle.string];
        if (item.attributedContentText.string.length) [self.sharedTexts addObject:item.attributedContentText.string];
        for (NSItemProvider *provider in item.attachments ?: @[]) {
            [self loadType:UTTypeURL.identifier provider:provider group:group];
            [self loadType:UTTypeText.identifier provider:provider group:group];
        }
    }
    dispatch_group_notify(group, dispatch_get_main_queue(), ^{ [self finishLoading]; });
}

- (void)loadType:(NSString *)type provider:(NSItemProvider *)provider group:(dispatch_group_t)group {
    if (![provider hasItemConformingToTypeIdentifier:type]) return;
    dispatch_group_enter(group);
    [provider loadItemForTypeIdentifier:type options:nil completionHandler:^(id<NSSecureCoding> value, NSError *error) {
        if (!error && value) {
            id object = (id)value;
            @synchronized (self) {
                if ([object isKindOfClass:NSURL.class]) {
                    NSString *candidate = [(NSURL *)object absoluteString];
                    if (!self.sharedURL.length && [self isSupportedMapsURL:candidate]) self.sharedURL = candidate;
                } else if ([object isKindOfClass:NSString.class]) {
                    NSString *text = (NSString *)object;
                    if (text.length) [self.sharedTexts addObject:text];
                    NSString *candidate = [self firstSupportedURLInText:text];
                    if (!self.sharedURL.length && candidate.length) self.sharedURL = candidate;
                }
            }
        }
        dispatch_group_leave(group);
    }];
}

- (BOOL)isSupportedMapsURL:(NSString *)value {
    NSURL *url = [NSURL URLWithString:value ?: @""];
    if (![url.scheme.lowercaseString isEqualToString:@"https"]) return NO;
    NSString *host = url.host.lowercaseString ?: @"";
    return [host isEqualToString:@"maps.apple"] || [host isEqualToString:@"maps.apple.com"] || [host isEqualToString:@"www.maps.apple.com"] ||
        [host isEqualToString:@"maps.app.goo.gl"] || [host isEqualToString:@"goo.gl"] ||
        [@[@"google.com",@"www.google.com",@"maps.google.com",@"google.co.jp",@"www.google.co.jp",@"maps.google.co.jp"] containsObject:host];
}

- (NSString *)firstSupportedURLInText:(NSString *)text {
    if (!text.length) return nil;
    NSDataDetector *detector = [NSDataDetector dataDetectorWithTypes:NSTextCheckingTypeLink error:nil];
    for (NSTextCheckingResult *match in [detector matchesInString:text options:0 range:NSMakeRange(0, text.length)]) {
        NSString *candidate = match.URL.absoluteString;
        if ([self isSupportedMapsURL:candidate]) return candidate;
    }
    return nil;
}

- (NSString *)prefilledName {
    for (NSString *text in self.sharedTexts) {
        for (NSString *line in [text componentsSeparatedByCharactersInSet:NSCharacterSet.newlineCharacterSet]) {
            NSString *trimmed = [line stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
            if (trimmed.length && ![trimmed containsString:@"://"] && trimmed.length <= 160) return trimmed;
        }
    }
    NSURLComponents *components = [NSURLComponents componentsWithString:self.sharedURL];
    for (NSURLQueryItem *item in components.queryItems ?: @[]) {
        if (([item.name isEqualToString:@"name"] || [item.name isEqualToString:@"q"] || [item.name isEqualToString:@"query"]) && item.value.length) {
            NSRegularExpression *coordinates = [NSRegularExpression regularExpressionWithPattern:@"^-?[0-9.]+\\s*,\\s*-?[0-9.]+$" options:0 error:nil];
            if ([coordinates numberOfMatchesInString:item.value options:0 range:NSMakeRange(0, item.value.length)] == 0) return item.value;
        }
    }
    NSArray *parts = components.URL.path.pathComponents;
    NSUInteger placeIndex = [parts indexOfObject:@"place"];
    if (placeIndex != NSNotFound && placeIndex + 1 < parts.count) return [parts[placeIndex + 1] stringByReplacingOccurrencesOfString:@"+" withString:@" "];
    return @"";
}

- (void)finishLoading {
    if (!self.sharedURL.length) {
        [self showError:@"Le partage ne contient aucun lien Apple Plans ou Google Maps exploitable."];
        return;
    }
    [self.activityIndicator stopAnimating];
    self.activityIndicator.hidden = YES;
    self.statusLabel.text = @"Vérifiez les informations avant l’enregistrement.";
    self.urlLabel.text = self.sharedURL;
    self.urlLabel.hidden = NO;
    self.nameField.text = [self prefilledName];
    [self resolveSharedName];
    self.nameField.enabled = YES;
    self.commentView.editable = YES;
    self.categoryPicker.userInteractionEnabled = YES;
    self.saveButton.enabled = YES;
    if (!self.nameField.text.length) [self.nameField becomeFirstResponder];
}

- (void)resolveSharedName {
    NSURL *url = [NSURL URLWithString:self.sharedURL];
    BOOL google = [url.host.lowercaseString isEqualToString:@"maps.app.goo.gl"];
    if (![url.host.lowercaseString isEqualToString:@"maps.apple"] && !google) return;
    NSString *originalName = self.nameField.text ?: @"";
    NSURLSessionConfiguration *configuration = NSURLSessionConfiguration.ephemeralSessionConfiguration;
    configuration.timeoutIntervalForResource = 18;
    NSURLSession *session = [NSURLSession sessionWithConfiguration:configuration];
    [[session dataTaskWithURL:url completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        NSURLComponents *components = [NSURLComponents componentsWithURL:response.URL resolvingAgainstBaseURL:NO];
        NSString *resolvedName = nil;
        for (NSURLQueryItem *item in components.queryItems) {
            if ([item.name isEqualToString:@"name"] || (google && [item.name isEqualToString:@"q"])) resolvedName = google ? [[[item.value stringByReplacingOccurrencesOfString:@"+" withString:@" "] componentsSeparatedByString:@","] firstObject] : item.value;
        }
        dispatch_async(dispatch_get_main_queue(), ^{
            if (!error && [response isKindOfClass:NSHTTPURLResponse.class] &&
                [(NSHTTPURLResponse *)response statusCode] == 200 &&
                ([components.host.lowercaseString isEqualToString:@"maps.apple.com"] || (google && [components.host.lowercaseString isEqualToString:@"www.google.com"])) && resolvedName.length) {
                if (!google) self.sharedURL = components.URL.absoluteString;
                self.urlLabel.text = self.sharedURL;
                if ([self.nameField.text isEqualToString:originalName]) self.nameField.text = resolvedName;
            }
        });
        [session finishTasksAndInvalidate];
    }] resume];
}

- (void)showError:(NSString *)message {
    [self.activityIndicator stopAnimating];
    self.activityIndicator.hidden = YES;
    self.statusLabel.textColor = UIColor.systemRedColor;
    self.statusLabel.text = message;
    self.saveButton.enabled = NO;
}

- (void)cancel {
    NSError *error = [NSError errorWithDomain:@"fr.cowprod.nearbyplaces.share" code:NSUserCancelledError userInfo:nil];
    [self.extensionContext cancelRequestWithError:error];
}

- (void)save {
    NSString *name = [self.nameField.text stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
    if (!name.length) {
        self.statusLabel.textColor = UIColor.systemRedColor;
        self.statusLabel.text = @"Le nom du lieu est obligatoire.";
        [self.nameField becomeFirstResponder];
        return;
    }
    if (!self.sharedURL.length) { [self showError:@"Le lien du lieu est manquant."]; return; }
    NSUserDefaults *defaults = [[NSUserDefaults alloc] initWithSuiteName:NearbyAppGroup];
    if (!defaults) { [self showError:@"Le stockage partagé Nearby Places est indisponible."]; return; }
    id storedQueue = [defaults objectForKey:NearbyQueueKey];
    if (storedQueue && ![storedQueue isKindOfClass:NSArray.class]) {
        [self showError:@"La file d’import partagée est illisible. Aucun élément n’a été écrasé."];
        return;
    }
    NSMutableArray *queue = storedQueue ? [(NSArray *)storedQueue mutableCopy] : [NSMutableArray array];
    if (queue.count >= NearbyQueueLimit) {
        [self showError:@"La file d’import est pleine. Ouvrez Nearby Places avant de réessayer."];
        return;
    }
    NSInteger row = [self.categoryPicker selectedRowInComponent:0];
    NSDictionary *category = row >= 0 && row < (NSInteger)self.categories.count ? self.categories[row] : self.categories.firstObject;
    NSDictionary *record = @{
        @"schemaVersion": @1,
        @"shareID": NSUUID.UUID.UUIDString,
        @"createdAt": @([NSDate.date timeIntervalSince1970]),
        @"nearbyName": name,
        @"nearbyComment": [self.commentView.text stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet] ?: @"",
        @"nearbyCategory": category[@"id"] ?: @"culture",
        @"nearbyURL": self.sharedURL,
        @"rawText": [self.sharedTexts componentsJoinedByString:@"\n"] ?: @""
    };
    NSError *writeError = nil;
    NSURL *container = [NSFileManager.defaultManager containerURLForSecurityApplicationGroupIdentifier:NearbyAppGroup];
    if (!container) {
        [self showError:@"Le conteneur App Group est inaccessible. Vérifiez la signature de l’extension."];
        return;
    }
    NSURL *directory = [container URLByAppendingPathComponent:@"NearbyShares" isDirectory:YES];
    BOOL created = [NSFileManager.defaultManager createDirectoryAtURL:directory withIntermediateDirectories:YES attributes:nil error:&writeError];
    NSArray *pendingFiles = created ? [NSFileManager.defaultManager contentsOfDirectoryAtURL:directory includingPropertiesForKeys:nil options:0 error:&writeError] : nil;
    if (pendingFiles.count >= NearbyQueueLimit) {
        [self showError:@"La file d’import est pleine. Ouvrez Nearby Places avant de réessayer."];
        return;
    }
    NSData *data = [NSJSONSerialization dataWithJSONObject:record options:0 error:&writeError];
    NSURL *file = [directory URLByAppendingPathComponent:[record[@"shareID"] stringByAppendingPathExtension:@"json"]];
    if (!created || !pendingFiles || !data || ![data writeToURL:file options:NSDataWritingAtomic error:&writeError]) {
        [self showError:[NSString stringWithFormat:@"Enregistrement impossible : %@", writeError.localizedDescription ?: @"stockage indisponible"]];
        return;
    }
    self.saveButton.enabled = NO;
    [self.extensionContext completeRequestReturningItems:@[] completionHandler:nil];
}

- (NSInteger)numberOfComponentsInPickerView:(UIPickerView *)pickerView { return 1; }
- (NSInteger)pickerView:(UIPickerView *)pickerView numberOfRowsInComponent:(NSInteger)component { return self.categories.count; }
- (NSString *)pickerView:(UIPickerView *)pickerView titleForRow:(NSInteger)row forComponent:(NSInteger)component { return self.categories[row][@"name"]; }

@end
