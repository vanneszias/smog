# Save and share filter sets

**Source:** https://mux.com/docs/_guides/developer/save-and-share-filter-sets

What are filter sets?

Filter sets allow you to save and share commonly used filter combinations into sets to ensure data consistency and streamline operational workflows.

1. To create a filter set, select the filter set button on any dashboard that supports filters.
2. Select ‘create new filter set’ from the menu.

3. Select a name for your filter set.

4. Choose if your filter set is public or private. Private means that only you will see it in the menu under your ‘private’ filter sets. Public means that all users in an environment will be able to see and select the filter set.

5. Select the filters that you wish to add to your filter set. The filter values that were selected on the page will automatically populate in this menu. You can remove or add new dimension and metric filters before saving.

Add a new filter value to a filter set

You can manually create a new filter value if it doesn’t yet exist in Mux Data. This is useful for an upcoming event or new product launch.

1. In the filter menu, select the dimension type on the left.
2. Type the value of the dimension that you wish to add.
3. The value you entered will appear in the results with zero views.
4. Select that value to add it to your filter set.
5. Select apply.
6. Select save.

This value will now be associated with your saved filter set. When selecting this filter set, it will show zero views until there are views that match that criteria.

Navigating with filter sets
When a filter set is selected, it will persist when navigating across dashboards in Mux Data. Not all filters are supported across all dashboards.

If you navigate to a dashboard on Mux that doesn’t support a filter in your selected filter set, that filter will be deactivated while on that dashboard. A warning message will appear and the filter set will appear yellow if all values are not applicable to that page. The filter will also appear in a deactivated state in the filter display menu.

Once you navigate to a dashboard where that filter is applicable, it will be reactivated.

Filter sets and Custom Dashboards

When you build a Custom Dashboard, filters and filter sets are saved as a setting of that dashboard. When you navigate to a Custom Dashboard, all selected filters and filter sets will be reset to the values saved to that dashboard.

Filter sets can be added to custom dashboards. However, filter sets are not available to be applied to custom dashboard components.

Delete a filter set

1. Select the edit filter set icon for the filter set you wish to delete.
2. In the filter set menu, select delete filter set icon.

<MultiImage
  images={[
    { sm: true, src: "/docs/images/save-and-share-filter-sets-5.png", width: 1130, height: 924, alt: "A Mux Metrics dashboard with the filter menu open. The filter dropdown lists private saved filter sets titled “IBC Conference” and “Engaged Views,” along with an option to create a new filter set. The dashboard displays graphs for views and overall viewer experience." },
    { sm: true, src: "/docs/images/save-and-share-filter-sets-6.png", width: 822, height: 1130, alt: "A Mux modal titled “Edit Filter Set.” The name field shows “IBC Conference.” Privacy is set to Private. One dimension filter is applied — a long video ID string. The bottom of the modal includes Cancel and Save buttons." },
  ]}
/>
